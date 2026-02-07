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
import { getContentMode, resolveContentSettings } from "@/lib/content-modes";
import type {
  BundleFn,
  BrowserInstance,
  GetExecutablePathFn,
  OpenBrowserFn,
  RenderJob,
  RenderMediaFn,
  SelectCompositionFn,
} from "@/types";

export const runtime = "nodejs";

type InputProps = Record<string, unknown>;

const storage = getStorage();

let bundlePromise: Promise<string> | null = null;
const lastProgressPercent = new Map<string, number>();

/**
 * Rendering strategy (the "pure solution"):
 * - Small frame chunks + work stealing queue
 * - Multi-browser instances
 * - Browser recycling to avoid Chrome heap/decoder buildup
 */
const DEFAULT_FRAME_CHUNK_SIZE = 60; // small granularity to balance cost variance
const DEFAULT_MAX_FRAMES_PER_BROWSER = 360; // recycle browser periodically
const DEFAULT_PER_BROWSER_CONCURRENCY = 2; // keep low to avoid intra-browser contention

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

/**
 * Returns a default concurrency value for the render job.
 * - Scales with CPU count but avoids overloading.
 */
const getDefaultConcurrency = () => {
  const cpuCount = Math.max(1, os.cpus().length);
  if (cpuCount <= 2) {
    return cpuCount;
  }
  const target = Math.floor(cpuCount * 0.75);
  return Math.max(2, Math.min(cpuCount - 1, target));
};

const getDefaultOffthreadThreads = () => {
  const cpuCount = Math.max(1, os.cpus().length);
  if (cpuCount <= 4) {
    return 2;
  }
  return Math.max(2, Math.min(6, Math.floor(cpuCount / 3)));
};

const buildFrameRanges = (totalFrames: number, chunkSize: number) => {
  const ranges: Array<{ start: number; end: number; index: number }> = [];
  let index = 0;
  for (let start = 0; start < totalFrames; start += chunkSize) {
    const end = Math.min(totalFrames - 1, start + chunkSize - 1);
    ranges.push({ start, end, index });
    index++;
  }
  return ranges;
};

const shouldUseMultiRender = () => process.env.REMOTION_MULTI_RENDER === "true";

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

    // Enforce the union type at compile time (avoids "string" errors)
    const resolvedChromeMode: "headless-shell" | "chrome-for-testing" =
      chromeMode === "headless-shell" ? "headless-shell" : "chrome-for-testing";

    const browserExecutable =
      process.env.REMOTION_RENDER_BROWSER_EXECUTABLE ||
      process.env.REMOTION_BROWSER_EXECUTABLE ||
      null;

    const renderDefaults = {
      logLevel: "warn" as const,
      browserExecutable,
      chromeMode: resolvedChromeMode,
    };

    const props = inputProps as InputProps;

    const composition = await selectComposition({
      serveUrl,
      id: compositionId,
      inputProps: props,
      ...renderDefaults,
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
    const ffmpegOverride = ffmpegLogEnabled
      ? ({
          type,
          args,
        }: {
          type: "stitcher" | "pre-stitcher";
          args: string[];
        }) => {
          console.log(`[render] ffmpeg ${type}: ${args.join(" ")}`);
          return args;
        }
      : undefined;

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

    const startedAt = Date.now();

    if (!shouldUseMultiRender()) {
      await renderMedia({
        serveUrl,
        composition,
        outputLocation: outputPath,
        codec: "h264",
        inputProps: props,
        concurrency,
        offthreadVideoThreads,
        ffmpegOverride,
        ...renderDefaults,
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
      // ===== Multi-render (solution) =====
      // - Small chunks (to balance uneven frame costs)
      // - Work stealing queue
      // - Browser recycling (to avoid Chrome heap/decoder buildup)
      const cpuCount = Math.max(1, os.cpus().length);

      const instanceOverride = resolvePositiveInt(
        process.env.REMOTION_MULTI_RENDER_INSTANCES
      );
      // Default: ~1 browser per 4 cores, capped reasonably
      const defaultInstances = Math.max(1, Math.min(12, Math.floor(cpuCount / 4) || 1));
      const instanceCount = Math.max(
        1,
        Math.min(instanceOverride ?? defaultInstances, totalFrames)
      );

      const chunkOverride = resolvePositiveInt(
        process.env.REMOTION_MULTI_RENDER_CHUNK_SIZE
      );
      const chunkSize = Math.max(
        1,
        chunkOverride ?? DEFAULT_FRAME_CHUNK_SIZE
      );

      const maxFramesPerBrowserOverride = resolvePositiveInt(
        process.env.REMOTION_MULTI_RENDER_MAX_FRAMES_PER_BROWSER
      );
      const maxFramesPerBrowser = Math.max(
        chunkSize,
        maxFramesPerBrowserOverride ?? DEFAULT_MAX_FRAMES_PER_BROWSER
      );

      const perBrowserConcurrencyOverride = resolvePositiveInt(
        process.env.REMOTION_MULTI_RENDER_PER_BROWSER_CONCURRENCY
      );
      const perBrowserConcurrency =
        typeof concurrency === "number"
          ? Math.max(
              1,
              Math.min(
                perBrowserConcurrencyOverride ?? DEFAULT_PER_BROWSER_CONCURRENCY,
                concurrency
              )
            )
          : (perBrowserConcurrencyOverride ?? DEFAULT_PER_BROWSER_CONCURRENCY);

      const ranges = buildFrameRanges(totalFrames, chunkSize);

      console.log(
        `[render] multi instances=${instanceCount} chunkSize=${chunkSize} maxFramesPerBrowser=${maxFramesPerBrowser} perBrowserConcurrency=${String(perBrowserConcurrency)}`
      );

      const tempDir = await createTempDir("remotion-multi");
      const listPath = path.join(tempDir, "concat.txt");
      const chunkPaths = ranges.map((range) =>
        path.join(tempDir, `chunk-${range.index}.ts`)
      );
      const audioPath = path.join(tempDir, "audio.aac");
      const concatPath = path.join(tempDir, "concat.ts");

      const chunkRendered = new Array(ranges.length).fill(0);
      const chunkTotals = ranges.map((range) => range.end - range.start + 1);

      const updateProgress = (chunkIndex: number, renderedCount: number) => {
        chunkRendered[chunkIndex] = Math.min(chunkTotals[chunkIndex], renderedCount);
        const totalRendered = chunkRendered.reduce((sum, v) => sum + v, 0);
        const safeProgress = Math.min(1, totalRendered / totalFrames);
        const percent = Math.floor(safeProgress * 100);
        const lastPercent = lastProgressPercent.get(id) ?? -1;
        if (percent === lastPercent) return;
        lastProgressPercent.set(id, percent);
        emitRenderProgress({
          userId,
          id,
          rendered: totalRendered,
          total: totalFrames,
          progress: safeProgress,
        });
      };

      // Work-stealing queue
      const queue = ranges.slice();

      const openNewBrowser = async () =>
        openBrowser("chrome", {
          ...renderDefaults,
        });

      // Each worker holds a browser, but recycles it periodically
      const worker = async () => {
        let browser: BrowserInstance | null = null;
        let framesSinceRecycle = 0;

        const ensureBrowser = async () => {
          if (!browser) browser = await openNewBrowser();
          return browser;
        };

        const recycleBrowser = async () => {
          if (browser) {
            await browser.close({ silent: true });
            browser = null;
          }
          framesSinceRecycle = 0;
        };

        try {
          while (queue.length > 0) {
            const next = queue.shift();
            if (!next) break;

            // Recycle before starting next chunk if we've processed enough frames
            if (framesSinceRecycle >= maxFramesPerBrowser) {
              await recycleBrowser();
            }

            const b = await ensureBrowser();

            const { start, end, index } = next;

            await renderMedia({
              serveUrl,
              composition,
              outputLocation: chunkPaths[index],
              codec: "h264-ts",
              inputProps: props,
              concurrency: perBrowserConcurrency,
              offthreadVideoThreads,
              ffmpegOverride,
              frameRange: [start, end],
              muted: true,
              puppeteerInstance: b,
              ...renderDefaults,
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

            // Mark done
            updateProgress(index, chunkTotals[index]);
            framesSinceRecycle += chunkTotals[index];
          }

        } finally {
          const b: BrowserInstance | null = browser;
          browser = null;
          if (b) {
            await b.close({ silent: true });
          }
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(instanceCount, ranges.length) }, () => worker())
      );

      // Render audio once
      const audioInputProps: InputProps = {
        audioSrc: (props as Record<string, unknown>).audioSrc,
        audioFadeInSeconds: (props as Record<string, unknown>).audioFadeInSeconds,
        audioFadeOutSeconds: (props as Record<string, unknown>).audioFadeOutSeconds,
        audioFadeInOffsetSeconds: (props as Record<string, unknown>).audioFadeInOffsetSeconds,
        audioFadeOutOffsetSeconds: (props as Record<string, unknown>).audioFadeOutOffsetSeconds,
        songDurationSeconds: (props as Record<string, unknown>).songDurationSeconds,
        fps: (props as Record<string, unknown>).fps,
      };

      const audioComposition = await selectComposition({
        serveUrl,
        id: "ContentLoopAudio",
        inputProps: audioInputProps,
        ...renderDefaults,
      });

      console.log("[render] audio render start");
      const audioBrowser = await openBrowser("chrome", { ...renderDefaults });
      await renderMedia({
        serveUrl,
        composition: audioComposition,
        outputLocation: audioPath,
        codec: "aac",
        audioCodec: "aac",
        imageFormat: "none",
        inputProps: audioInputProps,
        concurrency: 1,
        offthreadVideoThreads,
        ffmpegOverride,
        puppeteerInstance: audioBrowser,
        ...renderDefaults,
        onStart: ({ frameCount }) => {
          console.log(`[render] audio frames=${frameCount}`);
        },
      });
      await audioBrowser.close({ silent: true });
      console.log("[render] audio render done");

      // Concat chunks
      const listContent = chunkPaths
        .map((chunkPath) => `file '${chunkPath.replace(/'/g, "'\\''")}'`)
        .join("\n");
      await writeFilePath(listPath, listContent);

      const ffmpegPath =
        (getExecutablePath?.({
          type: "ffmpeg",
          indent: false,
          logLevel: "warn",
          binariesDirectory: null,
        }) ??
          process.env.REMOTION_FFMPEG_PATH ??
          "ffmpeg");

      console.log(
        `[render] concat start chunks=${chunkPaths.length} -> ${concatPath}`
      );
      await runFfmpeg(ffmpegPath, [
        "-hide_banner",
        "-fflags", "+genpts",
        "-avoid_negative_ts", "make_zero",
        "-f", "concat",
        "-safe", "0",
        "-i", listPath,
        "-c", "copy",
        "-muxpreload", "0",
        "-muxdelay", "0",
        "-y", concatPath,
      ]);
      console.log("[render] concat done");

      console.log(`[render] mux(start re-encode) -> ${outputPath}`);
      await runFfmpeg(ffmpegPath, [
        "-hide_banner",

        // Fix timestamps coming from TS concat
        "-fflags",
        "+genpts",
        "-avoid_negative_ts",
        "make_zero",

        // Inputs
        "-i",
        concatPath,
        "-i",
        audioPath,

        // Re-encode video to eliminate boundary glitches / black flashes
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        "18",
        "-preset",
        "veryfast",

        // Force constant framerate output
        "-vsync",
        "cfr",
        "-r",
        String(composition.fps),

        // Stable GOP (keyframe every 1s, no scene-cut keyframes)
        "-g",
        String(composition.fps),
        "-keyint_min",
        String(composition.fps),
        "-sc_threshold",
        "0",

        // Audio
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",

        // Web-friendly MP4
        "-movflags",
        "+faststart",

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

  const chromeMode: "headless-shell" | "chrome-for-testing" =
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
  const modeDefinition = getContentMode(item.mode);
  const compositionId = modeDefinition.compositionId;

  const serveUrl = await getServeUrl(entryPoint);

  const origin = new URL(request.url).origin;
  const assetToken = createContentAssetToken(user.id, id, 2 * 60 * 60);
  const withAssetToken = (url: string) =>
    assetToken
      ? `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(assetToken)}`
      : url;

  const resolved = resolveContentSettings(item.mode, item.settings ?? {});
  const props: InputProps = modeDefinition.buildProps({
    item,
    settings: resolved.settings,
    assets: {
      thumbnailSrc: withAssetToken(
        `${origin}/api/content/${id}/asset?type=thumbnail`
      ),
      videoSrc: withAssetToken(`${origin}/api/content/${id}/asset?type=video`),
      audioSrc: withAssetToken(`${origin}/api/content/${id}/asset?type=song`),
    },
  }) as unknown as InputProps;

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
