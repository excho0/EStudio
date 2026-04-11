import os from "os";
import path from "path";
import { spawn, spawnSync } from "child_process";
import { createTempDir, removePath, writeFilePath } from "@/lib/storage";
import {
  clearRenderProgressSnapshot,
  emitContentUpdate,
  emitRenderComplete,
  emitRenderProgress,
} from "@/lib/socket/manager";
import { updateContentItem } from "@/lib/data/content";
import { getLogger } from "@/lib/logging";
import { isRenderCancellationRequested } from "@/lib/rendering/cancel-store";
import { generateRenderThumbnailFromFile } from "@/lib/rendering/render-thumbnail";
import {
  clearRenderStatusCheckpoint,
  resolveRollbackContentStatus,
} from "@/lib/rendering/status-checkpoint";
import type {
  BundleFn,
  CombineChunksFn,
  GetExecutablePathFn,
  MakeCancelSignalFn,
  OpenBrowserFn,
  RenderJob,
  RenderMediaFn,
  SelectCompositionFn,
} from "@/types";

export type InputProps = Record<string, unknown>;

export class RenderCanceledError extends Error {
  constructor(message = "Render canceled by user.") {
    super(message);
    this.name = "RenderCanceledError";
  }
}

const isCancellationLikeError = (error: unknown) => {
  if (error instanceof RenderCanceledError) return true;
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("cancel");
};

let bundlePromise: Promise<string> | null = null;
const lastProgressPercent = new Map<string, number>();
const glProbeCache = new Map<string, boolean>();
const renderLogger = getLogger("render");

/**
 * Rendering strategy (the "pure solution"):
 * - Small frame chunks + work stealing queue
 * - Multi-browser instances
 * - Browser recycling to avoid Chrome heap/decoder buildup
 */
const DEFAULT_FRAME_CHUNK_SIZE = 60; // small granularity to balance cost variance
const DEFAULT_PER_BROWSER_CONCURRENCY = 2; // keep low to avoid intra-browser contention

export const loadRenderer = () => {
  const req = eval("require") as NodeJS.Require;
  const bundler = req("@remotion/bundler") as { bundle: BundleFn };
  const renderer = req("@remotion/renderer") as {
    openBrowser: OpenBrowserFn;
    renderMedia: RenderMediaFn;
    selectComposition: SelectCompositionFn;
    combineChunks: CombineChunksFn;
    getExecutablePath?: GetExecutablePathFn;
    makeCancelSignal?: MakeCancelSignalFn;
  };
  return {
    bundle: bundler.bundle,
    openBrowser: renderer.openBrowser,
    renderMedia: renderer.renderMedia,
    selectComposition: renderer.selectComposition,
    combineChunks: renderer.combineChunks,
    makeCancelSignal:
      typeof renderer.makeCancelSignal === "function"
        ? renderer.makeCancelSignal
        : null,
    getExecutablePath:
      typeof renderer.getExecutablePath === "function"
        ? renderer.getExecutablePath
        : null,
  };
};

export const getServeUrl = (entryPoint: string) => {
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

const resolveConcurrencyBudget = (
  cpuCount: number,
  concurrency: number | string | null
) => {
  if (typeof concurrency === "number") {
    return Math.max(1, Math.floor(concurrency));
  }
  if (typeof concurrency === "string") {
    const trimmed = concurrency.trim();
    if (trimmed.endsWith("%")) {
      const percent = Number(trimmed.slice(0, -1));
      if (Number.isFinite(percent) && percent > 0) {
        return Math.max(1, Math.floor((cpuCount * percent) / 100));
      }
    }
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric) && numeric > 0) {
      return Math.max(1, Math.floor(numeric));
    }
  }
  return Math.max(1, getDefaultConcurrency());
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

export const resolveChromiumGlBackend = () => {
  const value = process.env.REMOTION_RENDER_GL?.trim().toLowerCase();
  if (value === "angle") return "angle" as const;
  if (value === "egl") return "egl" as const;
  if (value === "swiftshader") return "swiftshader" as const;
  if (value === "swangle") return "swangle" as const;
  if (value === "auto") return "auto" as const;
  return null;
};

const probeGlBackendWithChromium = async (
  executablePath: string,
  backend: "angle" | "egl" | "swiftshader" | "swangle"
) => {
  const cacheKey = `${executablePath}::${backend}`;
  const cached = glProbeCache.get(cacheKey);
  if (typeof cached === "boolean") {
    return cached;
  }

  const html = [
    "<html><body><canvas id=\"c\" width=\"16\" height=\"16\"></canvas>",
    "<script>",
    "try {",
    "const c = document.getElementById('c');",
    "const gl = c && (c.getContext('webgl') || c.getContext('experimental-webgl'));",
    "document.body.setAttribute('data-webgl-ok', gl ? '1' : '0');",
    "} catch {",
    "document.body.setAttribute('data-webgl-ok', '0');",
    "}",
    "</script></body></html>",
  ].join("");
  const tempDir = await createTempDir("gl-probe");
  const probeHtmlPath = path.join(tempDir, `probe-${backend}.html`);
  await writeFilePath(probeHtmlPath, html);
  const url = `file://${probeHtmlPath}`;

  const ok = await new Promise<boolean>((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const backendArgs =
      backend === "swiftshader"
        ? ["--use-gl=angle", "--use-angle=swiftshader"]
        : backend === "swangle"
          ? ["--use-gl=angle", "--use-angle=swiftshader-webgl"]
          : [`--use-gl=${backend}`];
    const args = [
      "--headless",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu-vsync",
      "--ignore-gpu-blocklist",
      "--enable-webgl",
      ...backendArgs,
      "--virtual-time-budget=1500",
      "--dump-dom",
      url,
    ];
    const child = spawn(executablePath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const finalize = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", () => finalize(false));
    child.on("close", () => {
      if (!stdout.includes('data-webgl-ok="1"') && stderr.trim()) {
        const firstLine = stderr.split("\n").find((line) => line.trim().length > 0);
        if (firstLine) {
          renderLogger.debug({
            event: "gl-probe-detail",
            backend,
            detail: firstLine.trim(),
          });
        }
      }
      finalize(stdout.includes('data-webgl-ok="1"'));
    });

    setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      finalize(false);
    }, 8000);
  });

  await removePath(tempDir, { recursive: true, force: true });

  glProbeCache.set(cacheKey, ok);
  return ok;
};

export const resolveWorkingChromiumGl = async ({
  requested,
  executablePath,
}: {
  requested: "angle" | "egl" | "swiftshader" | "swangle" | "auto" | null;
  executablePath: string | null;
}) => {
  if (!requested || !executablePath) return null;

  const candidates =
    requested === "auto"
      ? (["angle", "egl", "swangle", "swiftshader"] as const)
      : ([requested] as const);

  for (const backend of candidates) {
    const available = await probeGlBackendWithChromium(executablePath, backend);
    renderLogger.debug({ event: "gl-probe", backend, available });
    if (available) {
      return backend;
    }
  }
  return null;
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

const logChromiumProcessSnapshot = (tag: string) => {
  try {
    const result = spawnSync(
      "bash",
      [
        "-lc",
        "ps -eo pid,cmd | rg 'chromium|chrome' | rg -v 'rg chromium|rg chrome' | head -n 20",
      ],
      { encoding: "utf8" }
    );
    const output = result.stdout?.trim();
    if (output) {
      renderLogger.debug({ event: "chromium-processes", tag, output });
    } else {
      renderLogger.debug({ event: "chromium-processes", tag, output: "none" });
    }
  } catch {
    // best-effort diagnostics only
  }
};

const cleanupRemotionChromiumProcesses = async () => {
  try {
    const ps = spawnSync("ps", ["-eo", "pid=,ppid=,args="], {
      encoding: "utf8",
    });
    if (!ps.stdout) return;

    const rows = ps.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\d+)\s+(\d+)\s+(.+)$/);
        if (!match) return null;
        return {
          pid: Number(match[1]),
          ppid: Number(match[2]),
          args: match[3],
        };
      })
      .filter((row): row is { pid: number; ppid: number; args: string } => Boolean(row));

    const childrenByParent = new Map<number, number[]>();
    for (const row of rows) {
      const children = childrenByParent.get(row.ppid) ?? [];
      children.push(row.pid);
      childrenByParent.set(row.ppid, children);
    }

    const roots = rows.filter((row) => {
      const looksLikeChromium = /(chromium|chrome)/i.test(row.args);
      if (!looksLikeChromium) return false;
      return (
        row.ppid === process.pid ||
        row.args.includes("puppeteer_dev_chrome_profile")
      );
    });

    const toKill = new Set<number>();
    const stack = roots.map((root) => root.pid);
    while (stack.length > 0) {
      const pid = stack.pop();
      if (!pid || toKill.has(pid)) continue;
      toKill.add(pid);
      const children = childrenByParent.get(pid) ?? [];
      for (const child of children) {
        stack.push(child);
      }
    }

    if (toKill.size === 0) return;

    for (const pid of toKill) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // ignore
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));

    for (const pid of toKill) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // ignore
      }
    }

    renderLogger.debug({ event: "chromium-cleanup", killed: toKill.size });
  } catch (error) {
    renderLogger.warn({ event: "chromium-cleanup-failed", error });
  }
};

export const startRenderJob = async ({
  userId,
  id,
  jobId,
  mode,
  browserLabel,
  chromeMode,
  serveUrl,
  compositionId,
  outputPath,
  inputProps,
}: RenderJob) => {
  const progressKey = `${id}:${jobId}`;
  let cancelMonitor: ReturnType<typeof setInterval> | null = null;
  try {
    const {
      renderMedia,
      selectComposition,
      combineChunks,
      getExecutablePath,
      makeCancelSignal,
    } =
      loadRenderer();
    const debugNonHeadless =
      process.env.REMOTION_RENDER_DEBUG_NON_HEADLESS === "true";

    // Enforce the union type at compile time (avoids "string" errors)
    const resolvedChromeMode: "headless-shell" | "chrome-for-testing" =
      chromeMode === "headless-shell" ? "headless-shell" : "chrome-for-testing";

    const browserExecutable =
      process.env.REMOTION_RENDER_BROWSER_EXECUTABLE ||
      process.env.REMOTION_BROWSER_EXECUTABLE ||
      null;
    const probeExecutable =
      browserExecutable ??
      (getExecutablePath?.({
        type: "compositor",
        indent: false,
        logLevel: "warn",
        binariesDirectory: null,
      }) ??
        null);

    const chromiumGlRequested = resolveChromiumGlBackend();
    const chromiumGl = await resolveWorkingChromiumGl({
      requested: chromiumGlRequested,
      executablePath: probeExecutable,
    });

    const chromiumOptions: Record<string, unknown> = {
      ...(debugNonHeadless ? { headless: false as const } : {}),
    };

    if (chromiumGl === "swangle") {
      chromiumOptions.gl = "angle";
      chromiumOptions.args = ["--use-angle=swiftshader-webgl"];
    } else if (chromiumGl === "swiftshader") {
      chromiumOptions.gl = "angle";
      chromiumOptions.args = ["--use-angle=swiftshader"];
    } else if (chromiumGl) {
      chromiumOptions.gl = chromiumGl;
    }

    const renderDefaults = {
      logLevel: "warn" as const,
      browserExecutable,
      chromeMode: resolvedChromeMode,
      ...((Object.keys(chromiumOptions).length > 0
        ? ({
            chromiumOptions,
          } as const)
        : {}) as Record<string, unknown>),
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
          renderLogger.debug({ event: "ffmpeg", type, args });
          return args;
        }
      : undefined;

    renderLogger.debug({
      event: "render-config",
      concurrency: String(concurrency),
      concurrencySource: process.env.REMOTION_RENDER_CONCURRENCY ?? "auto",
      offthreadVideoThreads: String(offthreadVideoThreads),
      offthreadSource: process.env.REMOTION_OFFTHREAD_VIDEO_THREADS ?? "auto",
      chromiumGl: chromiumGl ?? "disabled",
      chromiumGlRequested: chromiumGlRequested ?? "unset",
    });
    if (debugNonHeadless) {
      renderLogger.debug({ event: "debug-non-headless-enabled" });
    }
    logChromiumProcessSnapshot("before-render");

    lastProgressPercent.set(progressKey, -1);
    emitRenderProgress({
      userId,
      id,
      jobId,
      mode,
      key: progressKey,
      rendered: 0,
      total: totalFrames,
      progress: 0,
    });

    const startedAt = Date.now();
    let isCanceled = false;
    const cancellationControl = makeCancelSignal?.() ?? null;
    cancelMonitor = setInterval(() => {
      void (async () => {
        const requested = await isRenderCancellationRequested(userId, id);
        if (!requested || isCanceled) return;
        isCanceled = true;
        cancellationControl?.cancel();
      })();
    }, 1000);
    const assertNotCanceled = async () => {
      if (isCanceled) {
        throw new RenderCanceledError();
      }
      const requested = await isRenderCancellationRequested(userId, id);
      if (requested) {
        isCanceled = true;
        cancellationControl?.cancel();
        throw new RenderCanceledError();
      }
    };

    if (!shouldUseMultiRender()) {
      let lastChromiumSnapshotPercent = -1;
      await assertNotCanceled();
      await renderMedia({
        serveUrl,
        composition,
        outputLocation: outputPath,
        codec: "h264",
        inputProps: props,
        concurrency,
        offthreadVideoThreads,
        ffmpegOverride,
        cancelSignal: cancellationControl?.cancelSignal,
        ...renderDefaults,
        onStart: ({ frameCount, parallelEncoding, resolvedConcurrency }) => {
          renderLogger.info({
            event: "render-start",
            userId,
            id,
            frameCount,
            parallelEncoding: Boolean(parallelEncoding),
            resolvedConcurrency: String(resolvedConcurrency),
          });
          logChromiumProcessSnapshot("render-start");
        },
        onProgress: ({ renderedFrames, encodedFrames, progress }) => {
          if (isCanceled) return;
          const rendered = Number.isFinite(renderedFrames)
            ? Number(renderedFrames)
            : Number.isFinite(encodedFrames)
              ? Number(encodedFrames)
              : 0;
          const safeProgress =
            typeof progress === "number"
              ? progress
              : totalFrames > 0
                ? Math.min(1, Math.max(0, rendered / totalFrames))
                : 0;
          const percent = Math.floor(safeProgress * 100);
          const lastPercent = lastProgressPercent.get(progressKey) ?? -1;
          if (percent === lastPercent) {
            return;
          }
          lastProgressPercent.set(progressKey, percent);
          if (percent % 10 === 0 && percent !== lastChromiumSnapshotPercent) {
            lastChromiumSnapshotPercent = percent;
            logChromiumProcessSnapshot(`progress-${percent}%`);
          }
          if (percent % 25 === 0) {
            renderLogger.debug({
              event: "render-progress",
              userId,
              id,
              rendered,
              totalFrames,
              percent,
            });
          }
          emitRenderProgress({
            userId,
            id,
            jobId,
            mode,
            key: progressKey,
            rendered,
            total: totalFrames,
            progress: safeProgress,
          });
        },
      });
      await assertNotCanceled();
    } else {
      // ===== Multi-render using Remotion chunk combine =====
      const cpuCount = Math.max(1, os.cpus().length);
      const totalConcurrencyBudget = resolveConcurrencyBudget(cpuCount, concurrency);

      const instanceOverride = resolvePositiveInt(
        process.env.REMOTION_MULTI_RENDER_INSTANCES
      );
      // Default: ~1 browser per 4 cores, capped reasonably
      const defaultInstances = Math.max(1, Math.min(12, Math.floor(cpuCount / 4) || 1));
      const requestedInstances = Math.max(
        1,
        Math.min(instanceOverride ?? defaultInstances, totalFrames)
      );
      const instanceCount = Math.max(
        1,
        Math.min(requestedInstances, totalConcurrencyBudget)
      );

      const chunkOverride = resolvePositiveInt(
        process.env.REMOTION_MULTI_RENDER_CHUNK_SIZE
      );
      const chunkSize = Math.max(
        1,
        chunkOverride ?? DEFAULT_FRAME_CHUNK_SIZE
      );

      const perBrowserConcurrencyOverride = resolvePositiveInt(
        process.env.REMOTION_MULTI_RENDER_PER_BROWSER_CONCURRENCY
      );
      const requestedPerBrowserConcurrency =
        typeof concurrency === "number"
          ? Math.max(
              1,
              Math.min(
                perBrowserConcurrencyOverride ?? DEFAULT_PER_BROWSER_CONCURRENCY,
                concurrency
              )
            )
          : (perBrowserConcurrencyOverride ?? DEFAULT_PER_BROWSER_CONCURRENCY);
      const perBrowserConcurrency = Math.max(
        1,
        Math.min(
          requestedPerBrowserConcurrency,
          Math.max(1, Math.floor(totalConcurrencyBudget / instanceCount))
        )
      );

      const ranges = buildFrameRanges(totalFrames, chunkSize);
      const numChunks = ranges.length;

      renderLogger.debug({
        event: "multi-render-config",
        totalConcurrencyBudget,
        instanceCount,
        numChunks,
        chunkSize,
        requestedPerBrowserConcurrency,
        perChunkConcurrency: String(perBrowserConcurrency),
      });

      const tempDir = await createTempDir("remotion-multi");
      const chunkPaths = ranges.map((range) =>
        path.join(tempDir, `chunk-${range.index}.ts`)
      );
      const audioChunkPaths = ranges.map((range) =>
        path.join(tempDir, `chunk-${range.index}.aac`)
      );

      const chunkRendered = new Array(ranges.length).fill(0);
      const chunkTotals = ranges.map((range) => range.end - range.start + 1);

      const updateProgress = (chunkIndex: number, renderedCount: number) => {
        chunkRendered[chunkIndex] = Math.min(chunkTotals[chunkIndex], renderedCount);
        const totalRendered = chunkRendered.reduce((sum, v) => sum + v, 0);
        const safeProgress = Math.min(1, totalRendered / totalFrames);
        const percent = Math.floor(safeProgress * 100);
        const lastPercent = lastProgressPercent.get(progressKey) ?? -1;
        if (percent === lastPercent) return;
        lastProgressPercent.set(progressKey, percent);
        emitRenderProgress({
          userId,
          id,
          jobId,
          mode,
          key: progressKey,
          rendered: totalRendered,
          total: totalFrames,
          progress: safeProgress,
        });
      };

      try {
        const queue = ranges.slice();

        const runChunkWorker = async () => {
          while (queue.length > 0) {
            await assertNotCanceled();
            const next = queue.shift();
            if (!next) break;
            const { start, end, index } = next;
            renderLogger.debug({
              event: "chunk-start",
              id,
              chunkIndex: index,
              start,
              end,
            });
            await renderMedia({
              serveUrl,
              composition,
              outputLocation: chunkPaths[index],
              separateAudioTo: audioChunkPaths[index],
              codec: "h264-ts",
              audioCodec: "aac",
              enforceAudioTrack: true,
              forSeamlessAacConcatenation: true,
              inputProps: props,
              compositionStart: 0,
              concurrency: perBrowserConcurrency,
              offthreadVideoThreads,
              ffmpegOverride,
              cancelSignal: cancellationControl?.cancelSignal,
              frameRange: [start, end],
              ...renderDefaults,
              onProgress: ({ renderedFrames, encodedFrames, progress }) => {
                if (isCanceled) return;
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
            await assertNotCanceled();
            renderLogger.debug({
              event: "chunk-complete",
              id,
              chunkIndex: index,
              start,
              end,
            });
          }
        };

        await Promise.all(
          Array.from(
            { length: Math.min(instanceCount, ranges.length) },
            () => runChunkWorker()
          )
        );

        renderLogger.debug({
          event: "combine-start",
          id,
          chunks: numChunks,
          outputPath,
        });
        await combineChunks({
          outputLocation: outputPath,
          videoFiles: chunkPaths,
          audioFiles: audioChunkPaths,
          codec: "h264",
          audioCodec: "aac",
          fps: composition.fps,
          framesPerChunk: chunkSize,
          compositionDurationInFrames: totalFrames,
          preferLossless: false,
          logLevel: "warn",
        });
        renderLogger.debug({
          event: "combine-complete",
          id,
          chunks: numChunks,
          outputPath,
        });
      } finally {
        await removePath(tempDir, { recursive: true, force: true });
      }
    }
    if (cancelMonitor) {
      clearInterval(cancelMonitor);
      cancelMonitor = null;
    }
    const elapsedSeconds = Math.max(0.001, (Date.now() - startedAt) / 1000);
    const avgFps = Math.round(totalFrames / elapsedSeconds);
    renderLogger.info({
      event: "render-complete",
      userId,
      id,
      totalFrames,
      elapsedSeconds: Number(elapsedSeconds.toFixed(3)),
      avgFps,
    });

    const renderFileName = path.basename(outputPath);
    try {
      await generateRenderThumbnailFromFile({
        userId,
        contentId: id,
        renderFileName,
        inputPath: outputPath,
      });
    } catch (error) {
      renderLogger.warn({ event: "render-thumbnail-failed", userId, id, renderFileName, error });
    }

    const updated = await updateContentItem(userId, id, {
      status: "rendered",
    });
    await clearRenderStatusCheckpoint(userId, id);
    lastProgressPercent.delete(progressKey);
    emitContentUpdate({ userId, type: "content.status", id, jobId, status: "rendered" });
    emitContentUpdate({ userId, type: "content.rendered", id, item: updated });
    emitRenderComplete({
      userId,
      id,
      jobId,
      mode,
      key: progressKey,
      metadata: {
        renderName: path.basename(outputPath),
      },
      durationSeconds: elapsedSeconds,
      avgFps,
    });
  } catch (error) {
    if (isCancellationLikeError(error)) {
      void clearRenderProgressSnapshot({ userId, id, mode, key: progressKey });
      lastProgressPercent.delete(progressKey);
      await clearRenderStatusCheckpoint(userId, id);
      throw new RenderCanceledError();
    }
    void clearRenderProgressSnapshot({ userId, id, mode, key: progressKey });
    const nextStatus = await resolveRollbackContentStatus(userId, id);
    await updateContentItem(userId, id, { status: nextStatus });
    await clearRenderStatusCheckpoint(userId, id);
    emitContentUpdate({ userId, type: "content.status", id, jobId, status: nextStatus });
    const message = error instanceof Error ? error.message : "Render failed";
    renderLogger.error({
      event: "render-failed",
      userId,
      id,
      browserLabel,
      chromeMode,
      message,
    });
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(message);
  } finally {
    lastProgressPercent.delete(progressKey);
    if (cancelMonitor) {
      clearInterval(cancelMonitor);
    }
    await cleanupRemotionChromiumProcesses();
  }
};
