import type { CaptionDocument } from "../captions";
import type { VideoLoopSettings } from "../content/modes";

type ContentLoopRuntimeProps = {
  title: string;
  thumbnailSrc?: string;
  videoSrc: string;
  audioSrc: string;
  colorPalette?: string[];
  previewMode?: "full" | "performance";
  captionsData?: CaptionDocument | null;
  debugOverlayEnabled?: boolean;
  renderShaderEnabled?: boolean;
  renderShaderDebugMode?: "none" | "passthrough" | "uv" | "solid";
  songDurationSeconds?: number;
  fps?: number;
  width?: number;
  height?: number;
};

export type ContentLoopProps = ContentLoopRuntimeProps &
  Omit<VideoLoopSettings, "outputConfig" | "captionsLanguage" | "paletteModeOverride">;

export type ContentLoopInput = ContentLoopProps;

export type AudioOnlyProps = {
  audioSrc: string;
  audioFadeInSeconds?: number;
  audioFadeOutSeconds?: number;
  audioFadeInOffsetSeconds?: number;
  audioFadeOutOffsetSeconds?: number;
  songDurationSeconds?: number;
  fps?: number;
};

export type TemplateVideoProps = {
  title: string;
  subtitle: string;
  badge: string;
  accentColor: string;
  backgroundColor: string;
};
