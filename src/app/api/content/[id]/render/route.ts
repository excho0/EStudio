import os from "os";
import path from "path";
import { spawn } from "child_process";
import { NextResponse } from "next/server";
import {
  ensureContentStore,
  getContentRenderDir,
  getContentRenderPath,
  resolveContentPath,
} from "@/lib/content-store";
import { createTempDir, getStorage, removePath, writeFilePath } from "@/lib/storage";
import {
  emitContentUpdate,
  emitRenderComplete,
  emitRenderProgress,
} from "@/lib/socket";
import { getContentItem, updateContentItem } from "@/lib/data/content";
import { getSlug } from "@/lib/helpers";
import { getSessionUser } from "@/lib/auth-session";
import { createContentAssetToken } from "@/lib/content-asset-token";

export const runtime = "nodejs";

const storage = getStorage();

type RenderJob = {
  userId: string;
  id: string;
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

type BrowserInstance = {
  close: (options?: { silent?: boolean }) => Promise<void>;
};

type OpenBrowserFn = (
  browser: "chrome",
  options?: {
    browserExecutable?: string | null;
    chromeMode?: "chrome-for-testing" | "headless-shell";
    logLevel?: "warn";
  }
) => Promise<BrowserInstance>;

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
  codec: "h264" | "aac";
  inputProps: Record<string, unknown>;
  logLevel: "warn";
  browserExecutable: string | null;
  chromeMode: "chrome-for-testing" | "headless-shell";
  concurrency?: number | string | null;
  offthreadVideoThreads?: number;
  frameRange?: [number, number] | number;
  muted?: boolean;
  imageFormat?: "jpeg" | "png" | "none";
  audioCodec?: "pcm-16" | "aac" | "mp3" | "opus";
  puppeteerInstance?: BrowserInstance;
  forSeamlessAacConcatenation?: boolean;
  ffmpegOverride?: (payload: {
    type: "stitcher" | "pre-stitcher";
    args: string[];
  }) => string[];
  onStart?: (data: {
    frameCount: number;
    parallelEncoding?: boolean;
    resolvedConcurrency?: number | string | null;
  }) => void;
  onProgress?: (payload: {
    renderedFrames?: number | null;
    encodedFrames?: number | null;
    progress?: number | null;
  }) => void;
}) => Promise<unknown>;

type GetExecutablePathFn = (options: {
  type: "compositor" | "ffmpeg" | "ffprobe";
  indent: boolean;
  logLevel: "warn";
  binariesDirectory: string | null;
}) => string;

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
    openBrowser: OpenBrowserFn;
    renderMedia: RenderMediaFn;
    selectComposition: SelectCompositionFn;
    getExecutablePath?: GetExecutablePathFn;
  };
  return {
    bundle: bundler.bundle,
    openBrowser: renderer.openBrowser,
    renderMedia: renderer.renderMedia,
    selectComposition: renderer.selectComposition,
    getExecutablePath:
      typeof renderer.getExecutablePath === "function"
        ? renderer.getExecutablePath
        : null,
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

const resolveConcurrency = (value?: string | null) => {
  if (!value || value === "auto" || value === "null") {
    return null;
  }
  if (value.endsWith("%")) {
    return value;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

/**
 * Returns a default concurrency value for the render job.
 * The value is based on the number of CPUs available on the system.
 * If the number of CPUs is less than or equal to 2, the concurrency value is set to the number of CPUs.
 * Otherwise, the concurrency value is set to the minimum of the number of CPUs minus 1, and 75% of the number of CPUs, rounded down to the nearest whole number.
 * The concurrency value is capped at 2, to prevent overloading the system.
 * @returns {number} The default concurrency value.
 */
const getDefaultConcurrency = () => {
  const cpuCount = Math.max(1, os.cpus().length);
  if (cpuCount <= 2) {
    return cpuCount;
  }
  const target = Math.floor(cpuCount * 0.75);
  return Math.max(2, Math.min(cpuCount - 1, target));
};

const resolveOffthreadThreads = (value?: string | null) => {
  if (!value) {
    return undefined;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return undefined;
  }
  return Math.floor(numeric);
};

const resolvePositiveInt = (value?: string | null) => {
  if (!value) {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return Math.floor(numeric);
};

const buildFrameRanges = (totalFrames: number, chunkSize: number) => {
  const ranges: Array<{ start: number; end: number }> = [];
  for (let start = 0; start < totalFrames; start += chunkSize) {
    const end = Math.min(totalFrames - 1, start + chunkSize - 1);
    ranges.push({ start, end });
  }
  return ranges;
};

const getDefaultOffthreadThreads = () => {
  const cpuCount = Math.max(1, os.cpus().length);
  if (cpuCount <= 4) {
    return 2;
  }
  return Math.max(2, Math.min(6, Math.floor(cpuCount / 3)));
};

const shouldUseMultiRender = () =>
  process.env.REMOTION_MULTI_RENDER === "true";

const runFfmpeg = (binary: string, args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(binary, args, {
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
  });

const startRenderJob = async ({
  userId,
  id,
  browserLabel,
  chromeMode,
  serveUrl,
  compositionId,
  outputPath,
  inputProps,
}: RenderJob) => {
  try {
    const { renderMedia, selectComposition, openBrowser, getExecutablePath } =
      loadRenderer();
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
    const concurrencyOverride = resolveConcurrency(
      process.env.REMOTION_RENDER_CONCURRENCY
    );
    const concurrency =
      concurrencyOverride === null
        ? getDefaultConcurrency()
        : concurrencyOverride;
    const offthreadOverride = resolveOffthreadThreads(
      process.env.REMOTION_OFFTHREAD_VIDEO_THREADS
    );
    const offthreadVideoThreads =
      offthreadOverride ?? getDefaultOffthreadThreads();
    const ffmpegLogEnabled = process.env.REMOTION_LOG_FFMPEG === "true";
    console.log(
      `[render] concurrency=${String(concurrency)} source=${process.env.REMOTION_RENDER_CONCURRENCY ?? "auto"}`
    );
    console.log(
      `[render] offthreadVideoThreads=${String(offthreadVideoThreads)} source=${process.env.REMOTION_OFFTHREAD_VIDEO_THREADS ?? "auto"}`
    );

    lastProgressPercent.set(id, -1);
    emitRenderProgress({
      userId,
      id,
      rendered: 0,
      total: totalFrames,
      progress: 0,
    });

    const ffmpegOverride = ffmpegLogEnabled
      ? ({ type, args }: { type: "stitcher" | "pre-stitcher"; args: string[] }) => {
          console.log(`[render] ffmpeg ${type}: ${args.join(" ")}`);
          return args;
        }
      : undefined;
    const startedAt = Date.now();

    if (!shouldUseMultiRender()) {
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
        concurrency,
        offthreadVideoThreads,
        ffmpegOverride,
        onStart: ({ frameCount, parallelEncoding, resolvedConcurrency }) => {
          console.log(
            `[render] start frames=${frameCount} parallelEncoding=${Boolean(parallelEncoding)} resolvedConcurrency=${String(resolvedConcurrency)}`
          );
        },
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
            userId,
            id,
            rendered,
            total: totalFrames,
            progress: safeProgress,
          });
        },
      });
    } else {
      const instanceOverride = resolvePositiveInt(
        process.env.REMOTION_MULTI_RENDER_INSTANCES
      );
      const instanceCount = Math.max(
        1,
        Math.min(instanceOverride ?? 4, totalFrames)
      );
      const chunkOverride = resolvePositiveInt(
        process.env.REMOTION_MULTI_RENDER_CHUNK_SIZE
      );
      const chunkSize =
        chunkOverride ?? Math.ceil(totalFrames / instanceCount);
      const ranges = buildFrameRanges(totalFrames, chunkSize);
      const perInstanceConcurrency =
        typeof concurrency === "number"
          ? Math.max(1, Math.floor(concurrency / instanceCount))
          : concurrency;
      console.log(
        `[render] multi instances=${instanceCount} chunkSize=${chunkSize} perInstanceConcurrency=${String(perInstanceConcurrency)}`
      );

      const tempDir = await createTempDir("remotion-multi");
      const listPath = path.join(tempDir, "concat.txt");
      const chunkPaths = ranges.map((range, index) =>
        path.join(tempDir, `chunk-${index}.mp4`)
      );
      const audioPath = path.join(tempDir, "audio.aac");
      const concatPath = path.join(tempDir, "concat.mp4");

      const chunkRendered = new Array(ranges.length).fill(0);
      const chunkTotals = ranges.map(
        (range) => range.end - range.start + 1
      );

      const updateProgress = (chunkIndex: number, renderedCount: number) => {
        chunkRendered[chunkIndex] = Math.min(
          chunkTotals[chunkIndex],
          renderedCount
        );
        const totalRendered = chunkRendered.reduce(
          (sum, value) => sum + value,
          0
        );
        const safeProgress = Math.min(1, totalRendered / totalFrames);
        const percent = Math.floor(safeProgress * 100);
        const lastPercent = lastProgressPercent.get(id) ?? -1;
        if (percent === lastPercent) {
          return;
        }
        lastProgressPercent.set(id, percent);
        emitRenderProgress({
          userId,
          id,
          rendered: totalRendered,
          total: totalFrames,
          progress: safeProgress,
        });
      };

      const browsers = await Promise.all(
        Array.from({ length: Math.min(instanceCount, ranges.length) }, () =>
          openBrowser("chrome", {
            browserExecutable:
              process.env.REMOTION_RENDER_BROWSER_EXECUTABLE ||
              process.env.REMOTION_BROWSER_EXECUTABLE ||
              null,
            chromeMode,
            logLevel: "warn",
          })
        )
      );

      const queue = ranges.map((range, index) => ({ range, index }));
      const runChunk = async (browser: BrowserInstance) => {
        while (queue.length > 0) {
          const next = queue.shift();
          if (!next) {
            return;
          }
          const { range, index } = next;
          await renderMedia({
            serveUrl,
            composition,
            outputLocation: chunkPaths[index],
            codec: "h264",
            inputProps,
            logLevel: "warn",
            browserExecutable:
              process.env.REMOTION_RENDER_BROWSER_EXECUTABLE ||
              process.env.REMOTION_BROWSER_EXECUTABLE ||
              null,
            chromeMode,
            concurrency: perInstanceConcurrency,
            offthreadVideoThreads,
            ffmpegOverride,
            frameRange: [range.start, range.end],
            muted: true,
            puppeteerInstance: browser,
            onProgress: ({ renderedFrames, encodedFrames, progress }) => {
              const rendered = Number.isFinite(renderedFrames)
                ? Number(renderedFrames)
                : Number.isFinite(encodedFrames)
                  ? Number(encodedFrames)
                  : typeof progress === "number"
                    ? Math.round(progress * chunkTotals[index])
                    : 0;
              updateProgress(index, rendered);
            },
          });
          updateProgress(index, chunkTotals[index]);
        }
      };

      await Promise.all(browsers.map((browser) => runChunk(browser)));

      const audioBrowser = browsers[0];
      const audioInputProps = {
        audioSrc: inputProps.audioSrc,
        audioFadeInSeconds: inputProps.audioFadeInSeconds,
        audioFadeOutSeconds: inputProps.audioFadeOutSeconds,
        audioFadeInOffsetSeconds: inputProps.audioFadeInOffsetSeconds,
        audioFadeOutOffsetSeconds: inputProps.audioFadeOutOffsetSeconds,
        songDurationSeconds: inputProps.songDurationSeconds,
        fps: inputProps.fps,
      };
      const audioComposition = await selectComposition({
        serveUrl,
        id: "ContentLoopAudio",
        inputProps: audioInputProps,
        logLevel: "warn",
        browserExecutable:
          process.env.REMOTION_RENDER_BROWSER_EXECUTABLE ||
          process.env.REMOTION_BROWSER_EXECUTABLE ||
          null,
        chromeMode,
      });
      console.log("[render] audio render start");
      await renderMedia({
        serveUrl,
        composition: audioComposition,
        outputLocation: audioPath,
        codec: "aac",
        audioCodec: "aac",
        imageFormat: "none",
        inputProps: audioInputProps,
        logLevel: "warn",
        browserExecutable:
          process.env.REMOTION_RENDER_BROWSER_EXECUTABLE ||
          process.env.REMOTION_BROWSER_EXECUTABLE ||
          null,
        chromeMode,
        concurrency: 1,
        offthreadVideoThreads,
        ffmpegOverride,
        puppeteerInstance: audioBrowser,
        onStart: ({ frameCount }) => {
          console.log(`[render] audio frames=${frameCount}`);
        },
      });
      console.log("[render] audio render done");

      await Promise.all(
        browsers.map((browser) => browser.close({ silent: true }))
      );

      const listContent = chunkPaths
        .map((chunkPath) => `file '${chunkPath.replace(/'/g, "'\\''")}'`)
        .join("\n");
      await writeFilePath(listPath, listContent);

      console.log(
        `[render] concat start chunks=${chunkPaths.length} -> ${concatPath}`
      );
      const ffmpegPath =
        (getExecutablePath?.({
          type: "ffmpeg",
          indent: false,
          logLevel: "warn",
          binariesDirectory: null,
        }) ??
          process.env.REMOTION_FFMPEG_PATH ??
          "ffmpeg");
      await runFfmpeg(ffmpegPath, [
        "-hide_banner",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        listPath,
        "-c",
        "copy",
        "-y",
        concatPath,
      ]);
      console.log("[render] concat done");

      console.log(`[render] mux start -> ${outputPath}`);
      await runFfmpeg(ffmpegPath, [
        "-hide_banner",
        "-i",
        concatPath,
        "-i",
        audioPath,
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-shortest",
        "-y",
        outputPath,
      ]);
      console.log("[render] mux done");

      await removePath(tempDir, { recursive: true, force: true });
    }
    const elapsedSeconds = Math.max(0.001, (Date.now() - startedAt) / 1000);
    const avgFps = Math.round(totalFrames / elapsedSeconds);
    console.log(
      `[render] complete frames=${totalFrames} time=${elapsedSeconds.toFixed(1)}s avgFps=${avgFps}`
    );

    const updated = await updateContentItem(userId, id, {
      status: "rendered",
    });
    lastProgressPercent.delete(id);
    emitContentUpdate({ userId, type: "content:status", id, status: "rendered" });
    emitContentUpdate({ userId, type: "content:rendered", id, item: updated });
    emitRenderComplete({ userId, id, durationSeconds: elapsedSeconds, avgFps });
  } catch (error) {
    await updateContentItem(userId, id, { status: "failed" });
    emitContentUpdate({ userId, type: "content:status", id, status: "failed" });
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
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const resolvedBrowser =
    process.env.REMOTION_RENDER_BROWSER_EXECUTABLE ||
    process.env.REMOTION_BROWSER_EXECUTABLE ||
    null;
  const chromeMode =
    process.env.REMOTION_RENDER_CHROME_MODE === "headless-shell"
      ? "headless-shell"
      : "chrome-for-testing";
  const item = await getContentItem(user.id, id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await ensureContentStore(user.id);
  await updateContentItem(user.id, id, { status: "rendering" });
  emitContentUpdate({ userId: user.id, type: "content:status", id, status: "rendering" });

  const renderDirKey = getContentRenderDir(user.id, id);
  await storage.ensureDir(renderDirKey);
  const renderDir = resolveContentPath(renderDirKey);
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
  const renderPath = getContentRenderPath(user.id, id, fileName);
  const outputPath = resolveContentPath(renderPath);
  const entryPoint = path.join(process.cwd(), "src", "remotion", "index.tsx");
  const compositionId = "ContentLoop";

  const serveUrl = await getServeUrl(entryPoint);

  const origin = new URL(request.url).origin;
  const assetToken = createContentAssetToken(user.id, id);
  const withAssetToken = (url: string) =>
    assetToken
      ? `${url}${url.includes(\"?\") ? \"&\" : \"?\"}token=${encodeURIComponent(assetToken)}`
      : url;
  const props = {
    title: item.title,
    thumbnailSrc: withAssetToken(
      `${origin}/api/content/${id}/asset?type=thumbnail`
    ),
    videoSrc: withAssetToken(`${origin}/api/content/${id}/asset?type=video`),
    audioSrc: withAssetToken(`${origin}/api/content/${id}/asset?type=song`),
    segmentDurationSeconds: item.segmentDurationSeconds,
    fadeDurationSeconds: item.fadeDurationSeconds,
    introFadeSeconds: item.introFadeSeconds,
    outroFadeSeconds: item.outroFadeSeconds,
    audioFadeInSeconds: item.audioFadeInSeconds,
    audioFadeOutSeconds: item.audioFadeOutSeconds,
    audioFadeInOffsetSeconds: item.audioFadeInOffsetSeconds,
    audioFadeOutOffsetSeconds: item.audioFadeOutOffsetSeconds,
    visualizationEnabled: item.visualizationEnabled,
    visualizationBars: item.visualizationBars,
    edgeRaysEnabled: item.edgeRaysEnabled,
    edgeRaysIntensity: item.edgeRaysIntensity,
    edgeRaysVocalBalance: item.edgeRaysVocalBalance,
    videoDurationSeconds: item.videoDurationSeconds ?? item.segmentDurationSeconds,
    overlapRatio: item.overlapRatio ?? null,
    playbackRate: item.playbackRate ?? 1,
    scalePercent: item.scalePercent ?? 100,
    colorPalette: item.colorPalette ?? undefined,
    paletteMode: item.paletteMode ?? "auto",
    songDurationSeconds: item.songDurationSeconds,
    fps: item.fps,
    width: item.width,
    height: item.height,
  };

  const browserLabel = resolvedBrowser ?? "auto";
  void startRenderJob({
    userId: user.id,
    id,
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
