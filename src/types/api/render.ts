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
export type BrowserInstance = {
  close: (options?: { silent?: boolean }) => Promise<void>;
};
export type OpenBrowserFn = (
  browser: "chrome",
  options?: {
    browserExecutable?: string | null;
    chromeMode?: "chrome-for-testing" | "headless-shell";
    logLevel?: "warn";
  }
) => Promise<BrowserInstance>;
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
export type GetExecutablePathFn = (options: {
  type: "compositor" | "ffmpeg" | "ffprobe";
  indent: boolean;
  logLevel: "warn";
  binariesDirectory: string | null;
}) => string;
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
