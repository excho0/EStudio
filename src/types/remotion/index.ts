export type ContentLoopProps = {
  title: string;
  thumbnailSrc?: string;
  videoSrc: string;
  audioSrc: string;
  visualizationEnabled?: boolean;
  visualizationBars?: number;
  edgeRaysEnabled?: boolean;
  edgeRaysIntensity?: number;
  edgeRaysVocalBalance?: number;
  motionEnabled?: boolean;
  motionAmountPx?: number;
  motionSpeed?: number;
  motionAttack?: number;
  motionRelease?: number;
  sharpenEnabled?: boolean;
  sharpenAmount?: number;
  sharpenUseMaster?: boolean;
  sharpenMaster?: number;
  sharpenContrastWeight?: number;
  sharpenSaturationWeight?: number;
  sharpenBrightnessWeight?: number;
  colorPalette?: string[];
  scalePercent?: number;
  segmentDurationSeconds: number;
  fadeDurationSeconds: number;
  introFadeSeconds?: number;
  outroFadeSeconds?: number;
  audioFadeInSeconds?: number;
  audioFadeOutSeconds?: number;
  audioFadeInOffsetSeconds?: number;
  audioFadeOutOffsetSeconds?: number;
  videoDurationSeconds?: number;
  playbackRate?: number;
  overlapRatio?: number | null;
  renderShaderEnabled?: boolean;
  renderShaderDebugMode?: "none" | "passthrough" | "uv" | "solid";
  songDurationSeconds?: number;
  fps?: number;
  width?: number;
  height?: number;
};

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
