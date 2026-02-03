import type { ContentLoopProps } from "@/types";

export const CONTENT_LOOP_DEFAULTS: ContentLoopProps = {
  title: "Content Loop",
  thumbnailSrc: "",
  videoSrc: "",
  audioSrc: "",
  visualizationEnabled: true,
  visualizationBars: 128,
  edgeRaysEnabled: true,
  edgeRaysIntensity: 0.85,
  edgeRaysVocalBalance: 0.6,
  colorPalette: undefined,
  scalePercent: 100,
  segmentDurationSeconds: 4,
  fadeDurationSeconds: 1,
  introFadeSeconds: 0,
  outroFadeSeconds: 0,
  audioFadeInSeconds: 0,
  audioFadeOutSeconds: 0,
  audioFadeInOffsetSeconds: 0,
  audioFadeOutOffsetSeconds: 0,
  videoDurationSeconds: 4,
  playbackRate: 1,
  overlapRatio: 0.25,
  songDurationSeconds: 30,
  fps: 30,
  width: 1280,
  height: 720,
};

export const buildContentLoopProps = (
  overrides: Partial<ContentLoopProps>
): ContentLoopProps => ({
  ...CONTENT_LOOP_DEFAULTS,
  ...overrides,
});

type ContentLoopItemLike = {
  title?: string | null;
  segmentDurationSeconds?: number | null;
  fadeDurationSeconds?: number | null;
  introFadeSeconds?: number | null;
  outroFadeSeconds?: number | null;
  audioFadeInSeconds?: number | null;
  audioFadeOutSeconds?: number | null;
  audioFadeInOffsetSeconds?: number | null;
  audioFadeOutOffsetSeconds?: number | null;
  visualizationEnabled?: boolean | null;
  visualizationBars?: number | null;
  edgeRaysEnabled?: boolean | null;
  edgeRaysIntensity?: number | null;
  edgeRaysVocalBalance?: number | null;
  videoDurationSeconds?: number | null;
  overlapRatio?: number | null;
  playbackRate?: number | null;
  scalePercent?: number | null;
  colorPalette?: string[] | null;
  paletteMode?: "auto" | "manual" | null;
  songDurationSeconds?: number | null;
  fps?: number | null;
  width?: number | null;
  height?: number | null;
};

export const buildContentLoopPropsFromItem = (
  item: ContentLoopItemLike,
  overrides: Partial<ContentLoopProps> = {}
): ContentLoopProps =>
  buildContentLoopProps({
    title: item.title ?? CONTENT_LOOP_DEFAULTS.title,
    segmentDurationSeconds:
      item.segmentDurationSeconds ?? CONTENT_LOOP_DEFAULTS.segmentDurationSeconds,
    fadeDurationSeconds:
      item.fadeDurationSeconds ?? CONTENT_LOOP_DEFAULTS.fadeDurationSeconds,
    introFadeSeconds: item.introFadeSeconds ?? CONTENT_LOOP_DEFAULTS.introFadeSeconds,
    outroFadeSeconds: item.outroFadeSeconds ?? CONTENT_LOOP_DEFAULTS.outroFadeSeconds,
    audioFadeInSeconds:
      item.audioFadeInSeconds ?? CONTENT_LOOP_DEFAULTS.audioFadeInSeconds,
    audioFadeOutSeconds:
      item.audioFadeOutSeconds ?? CONTENT_LOOP_DEFAULTS.audioFadeOutSeconds,
    audioFadeInOffsetSeconds:
      item.audioFadeInOffsetSeconds ??
      CONTENT_LOOP_DEFAULTS.audioFadeInOffsetSeconds,
    audioFadeOutOffsetSeconds:
      item.audioFadeOutOffsetSeconds ??
      CONTENT_LOOP_DEFAULTS.audioFadeOutOffsetSeconds,
    visualizationEnabled:
      item.visualizationEnabled ?? CONTENT_LOOP_DEFAULTS.visualizationEnabled,
    visualizationBars:
      item.visualizationBars ?? CONTENT_LOOP_DEFAULTS.visualizationBars,
    edgeRaysEnabled: item.edgeRaysEnabled ?? CONTENT_LOOP_DEFAULTS.edgeRaysEnabled,
    edgeRaysIntensity:
      item.edgeRaysIntensity ?? CONTENT_LOOP_DEFAULTS.edgeRaysIntensity,
    edgeRaysVocalBalance:
      item.edgeRaysVocalBalance ?? CONTENT_LOOP_DEFAULTS.edgeRaysVocalBalance,
    videoDurationSeconds:
      item.videoDurationSeconds ?? CONTENT_LOOP_DEFAULTS.videoDurationSeconds,
    overlapRatio: item.overlapRatio ?? CONTENT_LOOP_DEFAULTS.overlapRatio,
    playbackRate: item.playbackRate ?? CONTENT_LOOP_DEFAULTS.playbackRate,
    scalePercent: item.scalePercent ?? CONTENT_LOOP_DEFAULTS.scalePercent,
    colorPalette: item.colorPalette ?? CONTENT_LOOP_DEFAULTS.colorPalette,
    songDurationSeconds:
      item.songDurationSeconds ?? CONTENT_LOOP_DEFAULTS.songDurationSeconds,
    fps: item.fps ?? CONTENT_LOOP_DEFAULTS.fps,
    width: item.width ?? CONTENT_LOOP_DEFAULTS.width,
    height: item.height ?? CONTENT_LOOP_DEFAULTS.height,
    ...overrides,
  });

export const resolveContentLoopMetadata = (props: ContentLoopProps) => {
  const fps = Number.isFinite(props.fps ?? NaN)
    ? props.fps ?? CONTENT_LOOP_DEFAULTS.fps
    : CONTENT_LOOP_DEFAULTS.fps;
  const width = Number.isFinite(props.width ?? NaN)
    ? props.width ?? CONTENT_LOOP_DEFAULTS.width
    : CONTENT_LOOP_DEFAULTS.width;
  const height = Number.isFinite(props.height ?? NaN)
    ? props.height ?? CONTENT_LOOP_DEFAULTS.height
    : CONTENT_LOOP_DEFAULTS.height;
  const songDurationSeconds = Number.isFinite(props.songDurationSeconds ?? NaN)
    ? props.songDurationSeconds ?? 1
    : 1;
  const durationInFrames = Math.max(1, Math.round(songDurationSeconds * fps!));

  return {
    fps,
    width,
    height,
    durationInFrames,
    props,
  };
};
