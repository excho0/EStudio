import path from "path";
import { NextResponse } from "next/server";
import {
  contentPaths,
  ensureContentStore,
} from "@/lib/content-store";
import { emitContentUpdate, emitRenderProgress } from "@/lib/socket";
import { getContentItem, updateContentItem } from "@/lib/data/content";

export const runtime = "nodejs";

type RenderJob = {
  id: string;
  renderPath: string;
  browserLabel: string;
  chromeMode: "chrome-for-testing" | "headless-shell";
  serveUrl: string;
  compositionId: string;
  outputPath: string;
  inputProps: Record<string, unknown>;
};

let bundlePromise: Promise<string> | null = null;
const lastProgressPercent = new Map<string, number>();
type BundleFn = (
  entryPoint: string,
  onProgress: (progress: number) => void,
  options: {
    outDir: string | null;
    enableCaching: boolean;
    publicPath: string | null;
    publicDir: string | null;
    rootDir: string | null;
    webpackOverride: (config: Record<string, unknown>) => Record<string, unknown>;
    onPublicDirCopyProgress: (progress: number) => void;
    onSymlinkDetected: (path: string) => void;
  }
) => Promise<string>;

type RenderMediaFn = (options: {
  serveUrl: string;
  composition: {
    id: string;
    durationInFrames: number;
    fps: number;
    width: number;
    height: number;
    defaultProps?: Record<string, unknown>;
  };
  outputLocation: string;
  codec: "h264";
  inputProps: Record<string, unknown>;
  logLevel: "warn";
  browserExecutable: string | null;
  chromeMode: "chrome-for-testing" | "headless-shell";
  onProgress: (payload: {
    renderedFrames?: number | null;
    encodedFrames?: number | null;
    progress?: number | null;
  }) => void;
}) => Promise<unknown>;

type SelectCompositionFn = (options: {
  serveUrl: string;
  id: string;
  inputProps: Record<string, unknown>;
  logLevel: "warn";
  browserExecutable: string | null;
  chromeMode: "chrome-for-testing" | "headless-shell";
}) => Promise<{
  id: string;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  defaultProps?: Record<string, unknown>;
}>;

const loadRenderer = () => {
  const req = eval("require") as NodeJS.Require;
  const bundler = req("@remotion/bundler") as { bundle: BundleFn };
  const renderer = req("@remotion/renderer") as {
    renderMedia: RenderMediaFn;
    selectComposition: SelectCompositionFn;
  };
  return {
    bundle: bundler.bundle,
    renderMedia: renderer.renderMedia,
    selectComposition: renderer.selectComposition,
  };
};

const getServeUrl = (entryPoint: string) => {
  if (!bundlePromise) {
    const { bundle } = loadRenderer();
    bundlePromise = bundle(entryPoint, () => undefined, {
      outDir: null,
      enableCaching: true,
      publicPath: null,
      publicDir: null,
      rootDir: process.cwd(),
      webpackOverride: (config: Record<string, unknown>) => config,
      onPublicDirCopyProgress: () => undefined,
      onSymlinkDetected: () => undefined,
    });
  }
  return bundlePromise;
};

const startRenderJob = async ({
  id,
  renderPath,
  browserLabel,
  chromeMode,
  serveUrl,
  compositionId,
  outputPath,
  inputProps,
}: RenderJob) => {
  try {
    const { renderMedia, selectComposition } = loadRenderer();
    const composition = await selectComposition({
      serveUrl,
      id: compositionId,
      inputProps,
      logLevel: "warn",
      browserExecutable:
        process.env.REMOTION_RENDER_BROWSER_EXECUTABLE ||
        process.env.REMOTION_BROWSER_EXECUTABLE ||
        null,
      chromeMode,
    });

    const totalFrames = composition.durationInFrames;

    lastProgressPercent.set(id, -1);
    emitRenderProgress({
      id,
      rendered: 0,
      total: totalFrames,
      progress: 0,
    });

    await renderMedia({
      serveUrl,
      composition,
      outputLocation: outputPath,
      codec: "h264",
      inputProps,
      logLevel: "warn",
      browserExecutable:
        process.env.REMOTION_RENDER_BROWSER_EXECUTABLE ||
        process.env.REMOTION_BROWSER_EXECUTABLE ||
        null,
      chromeMode,
      onProgress: ({ renderedFrames, encodedFrames, progress }) => {
        const rendered = Number.isFinite(renderedFrames)
          ? Number(renderedFrames)
          : Number.isFinite(encodedFrames)
            ? Number(encodedFrames)
            : 0;
        const safeProgress = typeof progress === "number" ? progress : 0;
        const percent = Math.floor(safeProgress * 100);
        const lastPercent = lastProgressPercent.get(id) ?? -1;
        if (percent === lastPercent) {
          return;
        }
        lastProgressPercent.set(id, percent);
        emitRenderProgress({
          id,
          rendered,
          total: totalFrames,
          progress: safeProgress,
        });
      },
    });

    const updated = await updateContentItem(id, {
      status: "rendered",
      renderPath,
    });
    lastProgressPercent.delete(id);
    emitContentUpdate({ type: "content:status", id, status: "rendered" });
    emitContentUpdate({ type: "content:rendered", id, item: updated });
  } catch (error) {
    await updateContentItem(id, { status: "failed" });
    emitContentUpdate({ type: "content:status", id, status: "failed" });
    const message = error instanceof Error ? error.message : "Render failed";
    console.error(
      `Render job failed for ${id} (browser=${browserLabel}, mode=${chromeMode}):`,
      message
    );
  }
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const resolvedBrowser =
    process.env.REMOTION_RENDER_BROWSER_EXECUTABLE ||
    process.env.REMOTION_BROWSER_EXECUTABLE ||
    null;
  const chromeMode =
    process.env.REMOTION_RENDER_CHROME_MODE === "headless-shell"
      ? "headless-shell"
      : "chrome-for-testing";
  const item = await getContentItem(id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await ensureContentStore();
  await updateContentItem(id, { status: "rendering" });
  emitContentUpdate({ type: "content:status", id, status: "rendering" });

  const outputFileName = `${id}.mp4`;
  const outputPath = path.join(contentPaths.rendersDir, outputFileName);
  const renderPath = path.relative(contentPaths.baseDir, outputPath);
  const entryPoint = path.join(process.cwd(), "src", "remotion", "index.tsx");
  const compositionId = "ContentLoop";

  const serveUrl = await getServeUrl(entryPoint);

  const origin = new URL(request.url).origin;
  const props = {
    title: item.title,
    thumbnailSrc: `${origin}/api/content/${id}/asset?type=thumbnail`,
    videoSrc: `${origin}/api/content/${id}/asset?type=video`,
    audioSrc: `${origin}/api/content/${id}/asset?type=song`,
    segmentDurationSeconds: item.segmentDurationSeconds,
    fadeDurationSeconds: item.fadeDurationSeconds,
    introFadeSeconds: item.introFadeSeconds,
    outroFadeSeconds: item.outroFadeSeconds,
    audioFadeInSeconds: item.audioFadeInSeconds,
    audioFadeOutSeconds: item.audioFadeOutSeconds,
    audioFadeInOffsetSeconds: item.audioFadeInOffsetSeconds,
    audioFadeOutOffsetSeconds: item.audioFadeOutOffsetSeconds,
    videoDurationSeconds: item.videoDurationSeconds ?? item.segmentDurationSeconds,
    overlapRatio: item.overlapRatio ?? null,
    playbackRate: item.playbackRate ?? 1,
    songDurationSeconds: item.songDurationSeconds,
    fps: item.fps,
    width: item.width,
    height: item.height,
  };

  const browserLabel = resolvedBrowser ?? "auto";
  void startRenderJob({
    id,
    renderPath,
    browserLabel,
    chromeMode,
    serveUrl,
    compositionId,
    outputPath,
    inputProps: props,
  });

  return NextResponse.json(
    {
      ok: true,
      status: "rendering",
      id,
      browser: browserLabel,
      chromeMode,
    },
    { status: 202 }
  );
}
