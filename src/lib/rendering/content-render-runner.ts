import path from "path";
import {
  ensureContentStore,
  getContentRenderDir,
  getContentRenderPath,
  resolveContentPath,
} from "@/lib/content/store";
import { getStorage } from "@/lib/storage";
import { emitContentUpdate } from "@/lib/socket/manager";
import { getContentItem, updateContentItem } from "@/lib/data/content";
import { getSlug } from "@/lib/shared/helpers";
import { createContentAssetToken } from "@/lib/content/asset-token";
import { getContentMode, resolveContentSettings } from "@/lib/content/modes";
import {
  getServeUrl,
  loadRenderer,
  resolveChromiumGlBackend,
  resolveWorkingChromiumGl,
  startRenderJob,
  type InputProps,
} from "./execute-render-job";

const storage = getStorage();

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
  requestUrl,
}: {
  userId: string;
  id: string;
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

  const slug = getSlug(item.title) || "untitled";
  const fileName = `${slug}_${nextIndex}.mp4`;
  const renderPath = getContentRenderPath(userId, id, fileName);
  const outputPath = resolveContentPath(renderPath);

  const entryPoint = path.join(process.cwd(), "src", "remotion", "index.tsx");
  const modeDefinition = getContentMode(item.mode);
  const compositionId = modeDefinition.compositionId;

  const serveUrl = await getServeUrl(entryPoint);

  const origin = resolveAssetBaseUrl(requestUrl);
  const assetToken = createContentAssetToken(userId, id, 2 * 60 * 60);
  const withAssetToken = (url: string) =>
    assetToken
      ? `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(assetToken)}`
      : url;

  const resolved = resolveContentSettings(item.mode, item.settings ?? {});
  const shaderDebugModeRaw =
    process.env.REMOTION_RENDER_SHADER_DEBUG_MODE?.trim().toLowerCase() ?? "none";
  const shaderDebugMode: "none" | "passthrough" | "uv" | "solid" =
    shaderDebugModeRaw === "passthrough" ||
    shaderDebugModeRaw === "uv" ||
    shaderDebugModeRaw === "solid"
      ? shaderDebugModeRaw
      : "none";
  const props: InputProps = modeDefinition.buildProps({
    item,
    settings: resolved.settings,
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
    console.log(
      `[render] shaderInRender=true source=${process.env.REMOTION_RENDER_ENABLE_SHADER ?? "unset"}`
    );
  }
  if (shaderDebugMode !== "none") {
    console.log(`[render] shaderDebugMode=${shaderDebugMode}`);
  }

  await startRenderJob({
    userId,
    id,
    browserLabel,
    chromeMode,
    serveUrl,
    compositionId,
    outputPath,
    inputProps: props,
  });

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
