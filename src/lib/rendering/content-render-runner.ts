import path from "path";
import { randomBytes } from "crypto";
import {
  ensureContentStore,
  getContentRenderDir,
  getContentRenderPath,
  hasAnyRenderedOutput,
  resolveContentPath,
} from "@/lib/content/store";
import { getStorage } from "@/lib/storage";
import { emitContentUpdate } from "@/lib/socket/manager";
import { getContentItem, updateContentItem } from "@/lib/data/content";
import { getSlug } from "@/lib/shared/helpers";
import { createContentAssetToken } from "@/lib/content/asset-token";
import {
  getContentMode,
  getOutputDefaultsForMode,
  resolveContentSettings,
} from "@/lib/content/modes";
import { getLogger } from "@/lib/logging";
import {
  getServeUrl,
  loadRenderer,
  RenderCanceledError,
  resolveChromiumGlBackend,
  resolveWorkingChromiumGl,
  startRenderJob,
  type InputProps,
} from "./execute-render-job";
import { clearRenderCancellation } from "@/lib/rendering/cancel-store";

const storage = getStorage();
const logger = getLogger("content-render-runner");

export class ContentRenderError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const resolveAssetBaseUrl = (requestUrl?: string) => {
  if (requestUrl) return new URL(requestUrl).origin;
  return (
    process.env.RENDER_ASSET_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    `http://localhost:${process.env.PORT || "3000"}`
  );
};

export const executeRenderForContent = async ({
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
  const resolvedBrowser =
    process.env.REMOTION_RENDER_BROWSER_EXECUTABLE ||
    process.env.REMOTION_BROWSER_EXECUTABLE ||
    null;

  const chromeMode: "headless-shell" | "chrome-for-testing" =
    process.env.REMOTION_RENDER_CHROME_MODE === "headless-shell"
      ? "headless-shell"
      : "chrome-for-testing";

  const item = await getContentItem(userId, id);
  if (!item) {
    throw new ContentRenderError("Not found", 404);
  }

  const renderShaderEnabled = process.env.REMOTION_RENDER_ENABLE_SHADER === "true";
  if (renderShaderEnabled) {
    const { getExecutablePath } = loadRenderer();
    const probeExecutable =
      resolvedBrowser ??
      (getExecutablePath?.({
        type: "compositor",
        indent: false,
        logLevel: "warn",
        binariesDirectory: null,
      }) ??
        null);
    const requestedGl = resolveChromiumGlBackend();
    const resolvedGl = await resolveWorkingChromiumGl({
      requested: requestedGl,
      executablePath: probeExecutable,
    });
    if (resolvedGl !== "angle") {
      throw new ContentRenderError(
        "Shader rendering requires Chromium GL backend 'angle'. Current environment resolved to a non-angle backend.",
        400
      );
    }
  }

  await ensureContentStore(userId);
  await updateContentItem(userId, id, { status: "rendering" });
  emitContentUpdate({ userId, type: "content:status", id, status: "rendering" });

  const renderDirKey = getContentRenderDir(userId, id);
  await storage.ensureDir(renderDirKey);

  let nextIndex = 1;
  try {
    const entries = await storage.list(renderDirKey);
    const mp4Count = entries.filter((entry) => entry.toLowerCase().endsWith(".mp4"))
      .length;
    nextIndex = mp4Count + 1;
  } catch {
    nextIndex = 1;
  }

  const entryPoint = path.join(process.cwd(), "src", "remotion", "index.tsx");
  const resolved = resolveContentSettings(mode ?? item.mode, item.settings ?? {});
  const modeDefinition = getContentMode(resolved.mode);
  const compositionId = modeDefinition.compositionId;
  const slug = getSlug(item.title) || "untitled";
  const modeSlug = getSlug(resolved.mode) || "mode";
  const shortId = randomBytes(3).toString("hex");
  const fileName = `${slug}_${nextIndex}_${modeSlug}_${shortId}.mp4`;
  const renderPath = getContentRenderPath(userId, id, fileName);
  const outputPath = resolveContentPath(renderPath);

  const serveUrl = await getServeUrl(entryPoint);

  const origin = resolveAssetBaseUrl(requestUrl);
  const assetToken = createContentAssetToken(userId, id, 2 * 60 * 60);
  const withAssetToken = (url: string) =>
    assetToken
      ? `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(assetToken)}`
      : url;

  const outputDefaults = getOutputDefaultsForMode(resolved.mode, resolved.settings);
  const shaderDebugModeRaw =
    process.env.REMOTION_RENDER_SHADER_DEBUG_MODE?.trim().toLowerCase() ?? "none";
  const shaderDebugMode: "none" | "passthrough" | "uv" | "solid" =
    shaderDebugModeRaw === "passthrough" ||
    shaderDebugModeRaw === "uv" ||
    shaderDebugModeRaw === "solid"
      ? shaderDebugModeRaw
      : "none";
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
  props.renderShaderEnabled = renderShaderEnabled;
  props.renderShaderDebugMode = shaderDebugMode;

  const browserLabel = resolvedBrowser ?? "auto";
  if (renderShaderEnabled) {
    logger.info(
      {
        source: process.env.REMOTION_RENDER_ENABLE_SHADER ?? "unset",
      },
      "Shader rendering in render pipeline enabled."
    );
  }
  if (shaderDebugMode !== "none") {
    logger.info({ shaderDebugMode }, "Shader debug mode enabled.");
  }

  try {
    await startRenderJob({
      userId,
      id,
      mode: resolved.mode,
      browserLabel,
      chromeMode,
      serveUrl,
      compositionId,
      outputPath,
      inputProps: props,
    });
  } catch (error) {
    if (error instanceof RenderCanceledError) {
      const nextStatus = (await hasAnyRenderedOutput(userId, id))
        ? "rendered"
        : "uploaded";
      await updateContentItem(userId, id, { status: nextStatus });
      emitContentUpdate({ userId, type: "content:status", id, status: nextStatus });
      await clearRenderCancellation(userId, id);
      return {
        ok: true,
        status: "canceled",
        id,
      };
    }
    throw error;
  }

  const latest = await getContentItem(userId, id);
  if (latest?.status === "failed") {
    throw new ContentRenderError("Render failed. Please check server logs.", 500);
  }

  return {
    ok: true,
    status: "done",
    id,
    browser: browserLabel,
    chromeMode,
  };
};
