export type PaletteMode = "auto" | "manual";

export type EditFormValues = {
  title: string;
  status: string;
  segmentDurationSeconds: string;
  fadeDurationSeconds: string;
  introFadeSeconds: string;
  outroFadeSeconds: string;
  audioFadeInSeconds: string;
  audioFadeOutSeconds: string;
  audioFadeInOffsetSeconds: string;
  audioFadeOutOffsetSeconds: string;
  visualizationEnabled: boolean;
  visualizationBars: string;
  edgeRaysEnabled: boolean;
  edgeRaysIntensity: string;
  edgeRaysVocalBalance: string;
  videoDurationSeconds: string;
  playbackRate: string;
  overlapPercent: number;
  fps: string;
  width: string;
  height: string;
  scalePercent: string;
};
