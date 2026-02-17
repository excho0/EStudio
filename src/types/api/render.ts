/**
 * Canonical render job payload passed into the render executor.
 */
export type RenderJob = {
  userId: string;
  id: string;
  browserLabel: string;
  chromeMode: "chrome-for-testing" | "headless-shell";
  serveUrl: string;
  compositionId: string;
  outputPath: string;
  inputProps: Record<string, unknown>;
};

/**
 * Remotion bundle function signature.
 */
export type BundleFn = (
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

/**
 * Minimal browser instance contract used by render internals.
 */
export type BrowserInstance = {
  close: (options?: { silent?: boolean }) => Promise<void>;
};

/**
 * Remotion browser opener signature.
 */
export type OpenBrowserFn = (
  browser: "chrome",
  options?: {
    browserExecutable?: string | null;
    chromeMode?: "chrome-for-testing" | "headless-shell";
    logLevel?: "warn";
  }
) => Promise<BrowserInstance>;

/**
 * Remotion media render function signature.
 */
export type RenderMediaFn = (options: {
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
  codec: "h264" | "h264-ts" | "aac";
  inputProps: Record<string, unknown>;
  logLevel: "warn";
  browserExecutable: string | null;
  chromeMode: "chrome-for-testing" | "headless-shell";
  concurrency?: number | string | null;
  offthreadVideoThreads?: number;
  frameRange?: [number, number] | number;
  compositionStart?: number;
  muted?: boolean;
  imageFormat?: "jpeg" | "png" | "none";
  audioCodec?: "pcm-16" | "aac" | "mp3" | "opus";
  separateAudioTo?: string;
  forSeamlessAacConcatenation?: boolean;
  enforceAudioTrack?: boolean;
  puppeteerInstance?: BrowserInstance;
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
  cancelSignal?: unknown;
}) => Promise<unknown>;

/**
 * Remotion cancellation token factory.
 */
export type MakeCancelSignalFn = () => {
  cancelSignal: unknown;
  cancel: () => void;
};

/**
 * Remotion executable path resolver signature.
 */
export type GetExecutablePathFn = (options: {
  type: "compositor" | "ffmpeg" | "ffprobe";
  indent: boolean;
  logLevel: "warn";
  binariesDirectory: string | null;
}) => string;

/**
 * Remotion composition selector signature.
 */
export type SelectCompositionFn = (options: {
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

/**
 * Remotion chunk combiner signature for multi-instance rendering.
 */
export type CombineChunksFn = (options: {
  outputLocation: string;
  audioFiles: string[];
  codec: "h264" | "h264-ts" | "aac";
  videoFiles: string[];
  fps: number;
  framesPerChunk: number;
  preferLossless: boolean;
  compositionDurationInFrames: number;
  audioCodec?: "pcm-16" | "aac" | "mp3" | "opus" | null;
  logLevel?: "trace" | "verbose" | "info" | "warn" | "error";
}) => Promise<void>;
