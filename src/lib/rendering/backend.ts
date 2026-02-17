import { z } from "zod";
import type * as RemotionLambdaClient from "@remotion/lambda-client";
import { ContentRenderError, executeRenderForContent } from "@/lib/rendering/content-render-runner";
import {
  ensureContentStore,
  getContentRenderDir,
  getContentRenderPath,
  hasAnyRenderedOutput,
} from "@/lib/content/store";
import { getStorage } from "@/lib/storage";
import { getSlug } from "@/lib/shared/helpers";
import {
  clearRenderProgressSnapshot,
  emitContentUpdate,
  emitRenderComplete,
  emitRenderProgress,
} from "@/lib/socket/manager";
import { getContentItem, updateContentItem } from "@/lib/data/content";
import { createContentAssetToken } from "@/lib/content/asset-token";
import { getContentMode, resolveContentSettings } from "@/lib/content/modes";
import { getOutputDefaultsForMode } from "@/lib/content/modes";
import type { InputProps } from "@/lib/rendering/execute-render-job";
import { RenderCanceledError } from "@/lib/rendering/execute-render-job";
import {
  clearRenderCancellation,
  isRenderCancellationRequested,
} from "@/lib/rendering/cancel-store";
import { randomBytes } from "crypto";

export const renderBackendSchema = z.enum(["local", "lambda"]);

export type RenderBackend = z.infer<typeof renderBackendSchema>;

export const resolveRenderBackend = (requested?: string | null): RenderBackend => {
  const fallback = process.env.RENDER_BACKEND?.trim().toLowerCase() ?? "local";
  const value = (requested ?? fallback).trim().toLowerCase();
  return renderBackendSchema.parse(value);
};

const executeLambdaRenderForContent = async ({
  userId,
  id,
  mode,
  requestUrl,
}: {
  userId: string;
  id: string;
  mode?: string;
  requestUrl?: string;
}) => {
  const item = await getContentItem(userId, id);
  if (!item) {
    throw new ContentRenderError("Not found", 404);
  }

  const resolveAssetBaseUrl = () => {
    if (requestUrl) return new URL(requestUrl).origin;
    return (
      process.env.RENDER_ASSET_BASE_URL?.trim() ||
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      `http://localhost:${process.env.PORT || "3000"}`
    );
  };
  const origin = resolveAssetBaseUrl();
  const assetToken = createContentAssetToken(userId, id, 2 * 60 * 60);
  const withAssetToken = (url: string) =>
    assetToken
      ? `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(assetToken)}`
      : url;

  const resolved = resolveContentSettings(mode ?? item.mode, item.settings ?? {});
  const modeDefinition = getContentMode(resolved.mode);
  const outputDefaults = getOutputDefaultsForMode(resolved.mode, resolved.settings);
  const props: InputProps = modeDefinition.buildProps({
    item: {
      ...item,
      mode: resolved.mode,
    },
    settings: {
      ...resolved.settings,
      outputConfig: {
        ...(resolved.settings.outputConfig as Record<string, unknown> | undefined),
        fps: outputDefaults.fps,
        width: outputDefaults.width,
        height: outputDefaults.height,
      },
    },
    assets: {
      thumbnailSrc: withAssetToken(`${origin}/api/content/${id}/asset?type=thumbnail`),
      videoSrc: withAssetToken(`${origin}/api/content/${id}/asset?type=video`),
      audioSrc: withAssetToken(`${origin}/api/content/${id}/asset?type=song`),
    },
  }) as unknown as InputProps;
  props.renderShaderEnabled = process.env.REMOTION_RENDER_ENABLE_SHADER === "true";
  props.renderShaderDebugMode = "none";

  const functionName = process.env.REMOTION_LAMBDA_FUNCTION_NAME?.trim() || "";
  const rawRegion = process.env.REMOTION_LAMBDA_REGION?.trim() || "";
  const serveUrl = process.env.REMOTION_LAMBDA_SERVE_URL?.trim() || "";
  const endpoint = process.env.RENDER_LAMBDA_DISPATCH_URL?.trim();

  if (!functionName || !rawRegion || !serveUrl) {
    if (endpoint) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, id, requestUrl }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; status?: string; id?: string; message?: string; error?: string }
        | null;
      if (!response.ok) {
        throw new ContentRenderError(
          payload?.error || payload?.message || "Lambda render dispatch failed.",
          response.status || 500
        );
      }
      return {
        ok: true,
        status: payload?.status ?? "done",
        id: payload?.id ?? id,
        backend: "lambda" as const,
      };
    }
    throw new ContentRenderError(
      "Lambda backend is missing required env vars: REMOTION_LAMBDA_FUNCTION_NAME, REMOTION_LAMBDA_REGION, REMOTION_LAMBDA_SERVE_URL.",
      500
    );
  }

  const lambdaModule: typeof RemotionLambdaClient | null = await import(
    "@remotion/lambda-client"
  )
    .then((module) => module as typeof RemotionLambdaClient)
    .catch(() => null);
  if (!lambdaModule?.renderMediaOnLambda || !lambdaModule.getRenderProgress) {
    throw new ContentRenderError(
      "Missing @remotion/lambda-client dependency. Install @remotion/lambda-client to use lambda render backend.",
      500
    );
  }
  const validateAwsRegion: (region: string) => void =
    lambdaModule.LambdaClientInternals.validateAwsRegion;
  try {
    validateAwsRegion(rawRegion);
  } catch {
    throw new ContentRenderError(`Invalid REMOTION_LAMBDA_REGION: ${rawRegion}`, 500);
  }
  const region = rawRegion as RemotionLambdaClient.AwsRegion;

  await ensureContentStore(userId);
  await updateContentItem(userId, id, { status: "rendering" });
  emitContentUpdate({ userId, type: "content:status", id, status: "rendering" });

  const storage = getStorage();
  const renderDirKey = getContentRenderDir(userId, id);
  await storage.ensureDir(renderDirKey);
  const entries = await storage.list(renderDirKey).catch(() => []);
  const mp4Count = entries.filter((entry) => entry.toLowerCase().endsWith(".mp4")).length;
  const slug = getSlug(item.title) || "untitled";
  const fileName = `${slug}_${mp4Count + 1}_${randomBytes(3).toString("hex")}.mp4`;
  const outputKey = getContentRenderPath(userId, id, fileName);

  const invoke = await lambdaModule.renderMediaOnLambda({
    region,
    functionName,
    serveUrl,
    composition: modeDefinition.compositionId,
    codec: "h264",
    imageFormat: "jpeg",
    inputProps: props as Record<string, unknown>,
    outName: outputKey,
    maxRetries: 1,
    privacy: "public",
    downloadBehavior: {
      type: "download",
      fileName: null,
    },
  });

  const renderId = String(invoke.renderId ?? "");
  const bucketName = String(invoke.bucketName ?? process.env.REMOTION_LAMBDA_BUCKET_NAME ?? "");
  if (!renderId) {
    throw new ContentRenderError("Lambda render did not return a renderId.", 500);
  }

  const pollIntervalMs = Math.max(1000, Number(process.env.REMOTION_LAMBDA_POLL_MS ?? "3000"));
  const timeoutMs = Math.max(60_000, Number(process.env.REMOTION_LAMBDA_TIMEOUT_MS ?? "3600000"));
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const cancelRequested = await isRenderCancellationRequested(userId, id);
    if (cancelRequested) {
      const nextStatus = (await hasAnyRenderedOutput(userId, id))
        ? "rendered"
        : "uploaded";
      await updateContentItem(userId, id, { status: nextStatus });
      emitContentUpdate({ userId, type: "content:status", id, status: nextStatus });
      await clearRenderProgressSnapshot({ userId, id });
      await clearRenderCancellation(userId, id);
      throw new RenderCanceledError();
    }
    const progress = await lambdaModule.getRenderProgress({
      region,
      functionName,
      renderId,
      bucketName,
    });
    const done = Boolean(progress.done);
    const fatalError =
      typeof progress.fatalErrorEncountered === "string"
        ? progress.fatalErrorEncountered
        : null;
    const overallProgress =
      typeof progress.overallProgress === "number"
        ? Math.min(1, Math.max(0, progress.overallProgress))
        : 0;

    emitRenderProgress({
      userId,
      id,
      rendered: Math.floor(overallProgress * 100),
      total: 100,
      progress: overallProgress,
    });

    if (fatalError) {
      await updateContentItem(userId, id, { status: "failed" });
      emitContentUpdate({ userId, type: "content:status", id, status: "failed" });
      throw new ContentRenderError(`Lambda render failed: ${fatalError}`, 500);
    }

    if (done) {
      const outputFile =
        typeof progress.outputFile === "string" && progress.outputFile.length > 0
          ? progress.outputFile
          : null;
      if (!outputFile) {
        await updateContentItem(userId, id, { status: "failed" });
        emitContentUpdate({ userId, type: "content:status", id, status: "failed" });
        throw new ContentRenderError("Lambda render completed without output file URL.", 500);
      }

      const outputResponse = await fetch(outputFile);
      if (!outputResponse.ok) {
        await updateContentItem(userId, id, { status: "failed" });
        emitContentUpdate({ userId, type: "content:status", id, status: "failed" });
        throw new ContentRenderError(
          `Failed to download lambda output: HTTP ${outputResponse.status}`,
          500
        );
      }

      const outputBuffer = Buffer.from(await outputResponse.arrayBuffer());
      await storage.writeFile(outputKey, outputBuffer);
      await updateContentItem(userId, id, { status: "rendered" });
      emitContentUpdate({ userId, type: "content:status", id, status: "rendered" });
      emitRenderComplete({ userId, id });
      await clearRenderCancellation(userId, id);

      return {
        ok: true,
        status: "done",
        id,
        backend: "lambda" as const,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  await updateContentItem(userId, id, { status: "failed" });
  emitContentUpdate({ userId, type: "content:status", id, status: "failed" });
  throw new ContentRenderError("Lambda render timed out while waiting for completion.", 504);
};

export const executeRenderForContentWithBackend = async ({
  userId,
  id,
  backend,
  mode,
  requestUrl,
}: {
  userId: string;
  id: string;
  backend: RenderBackend;
  mode?: string;
  requestUrl?: string;
}) => {
  try {
    if (backend === "local") {
      const result = await executeRenderForContent({ userId, id, mode, requestUrl });
      await clearRenderCancellation(userId, id);
      return { ...result, backend: "local" as const };
    }

    return await executeLambdaRenderForContent({ userId, id, mode, requestUrl });
  } catch (error) {
    if (error instanceof RenderCanceledError) {
      return {
        ok: true,
        status: "canceled",
        id,
        backend,
      };
    }
    throw error;
  }
};
