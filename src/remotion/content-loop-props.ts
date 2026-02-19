import type { ContentLoopProps } from "../types";
import { captionDocumentSchema } from "../types";

export const CONTENT_LOOP_DEFAULTS: ContentLoopProps = {
  title: "Content Loop",
  thumbnailSrc: "",
  videoSrc: "",
  audioSrc: "",
  visualizationEnabled: true,
  visualizationBars: 128,
  edgeRaysEnabled: true,
  edgeRaysIntensity: 0.3,
  edgeRaysVocalBalance: 0.6,
  motionEnabled: false,
  motionAmountPx: 4,
  motionSpeed: 0.6,
  motionAttack: 0.9,
  motionRelease: 0.32,
  sharpenEnabled: false,
  sharpenAmount: 0.4,
  sharpenUseMaster: true,
  sharpenMaster: 0.4,
  sharpenContrastWeight: 0.45,
  sharpenSaturationWeight: 0.2,
  sharpenBrightnessWeight: 0.03,
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
  captionsEnabled: false,
  captionsStyle: "subtitle",
  captionsData: null,
  renderShaderEnabled: false,
  renderShaderDebugMode: "none",
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
  motionEnabled?: boolean | null;
  motionAmountPx?: number | null;
  motionSpeed?: number | null;
  motionAttack?: number | null;
  motionRelease?: number | null;
  sharpenEnabled?: boolean | null;
  sharpenAmount?: number | null;
  sharpenUseMaster?: boolean | null;
  sharpenMaster?: number | null;
  sharpenContrastWeight?: number | null;
  sharpenSaturationWeight?: number | null;
  sharpenBrightnessWeight?: number | null;
  videoDurationSeconds?: number | null;
  overlapRatio?: number | null;
  playbackRate?: number | null;
  scalePercent?: number | null;
  captionsEnabled?: boolean | null;
  captionsStyle?: "subtitle" | "tiktok" | null;
  captionsData?: unknown;
  colorPalette?: string[] | null;
  paletteMode?: "auto" | "manual" | null;
  songDurationSeconds?: number | null;
  settings?: Record<string, unknown> | null;
};

export const buildContentLoopPropsFromItem = (
  item: ContentLoopItemLike,
  overrides: Partial<ContentLoopProps> = {}
): ContentLoopProps => {
  const settings = (item.settings ?? {}) as Record<string, unknown>;
  const sharedSettings =
    settings.__shared && typeof settings.__shared === "object"
      ? (settings.__shared as Record<string, unknown>)
      : {};
  const getSetting = <T>(key: string, fallback?: T) =>
    (settings[key] as T | undefined) ?? fallback;

  const rawCaptionsData =
    sharedSettings.captionsData ??
    getSetting<unknown>("captionsData") ??
    item.captionsData ??
    null;
  const parsedCaptionsData = captionDocumentSchema
    .nullable()
    .safeParse(rawCaptionsData);
  const captionsData = parsedCaptionsData.success ? parsedCaptionsData.data : null;

  return buildContentLoopProps({
    title: item.title ?? CONTENT_LOOP_DEFAULTS.title,
    segmentDurationSeconds:
      getSetting<number>("segmentDurationSeconds") ??
      item.segmentDurationSeconds ??
      CONTENT_LOOP_DEFAULTS.segmentDurationSeconds,
    fadeDurationSeconds:
      getSetting<number>("fadeDurationSeconds") ??
      item.fadeDurationSeconds ??
      CONTENT_LOOP_DEFAULTS.fadeDurationSeconds,
    introFadeSeconds:
      getSetting<number>("introFadeSeconds") ??
      item.introFadeSeconds ??
      CONTENT_LOOP_DEFAULTS.introFadeSeconds,
    outroFadeSeconds:
      getSetting<number>("outroFadeSeconds") ??
      item.outroFadeSeconds ??
      CONTENT_LOOP_DEFAULTS.outroFadeSeconds,
    audioFadeInSeconds:
      getSetting<number>("audioFadeInSeconds") ??
      item.audioFadeInSeconds ??
      CONTENT_LOOP_DEFAULTS.audioFadeInSeconds,
    audioFadeOutSeconds:
      getSetting<number>("audioFadeOutSeconds") ??
      item.audioFadeOutSeconds ??
      CONTENT_LOOP_DEFAULTS.audioFadeOutSeconds,
    audioFadeInOffsetSeconds:
      getSetting<number>("audioFadeInOffsetSeconds") ??
      item.audioFadeInOffsetSeconds ??
      CONTENT_LOOP_DEFAULTS.audioFadeInOffsetSeconds,
    audioFadeOutOffsetSeconds:
      getSetting<number>("audioFadeOutOffsetSeconds") ??
      item.audioFadeOutOffsetSeconds ??
      CONTENT_LOOP_DEFAULTS.audioFadeOutOffsetSeconds,
    visualizationEnabled:
      getSetting<boolean>("visualizationEnabled") ??
      item.visualizationEnabled ??
      CONTENT_LOOP_DEFAULTS.visualizationEnabled,
    visualizationBars:
      getSetting<number>("visualizationBars") ??
      item.visualizationBars ??
      CONTENT_LOOP_DEFAULTS.visualizationBars,
    edgeRaysEnabled:
      getSetting<boolean>("edgeRaysEnabled") ??
      item.edgeRaysEnabled ??
      CONTENT_LOOP_DEFAULTS.edgeRaysEnabled,
    edgeRaysIntensity:
      getSetting<number>("edgeRaysIntensity") ??
      item.edgeRaysIntensity ??
      CONTENT_LOOP_DEFAULTS.edgeRaysIntensity,
    edgeRaysVocalBalance:
      getSetting<number>("edgeRaysVocalBalance") ??
      item.edgeRaysVocalBalance ??
      CONTENT_LOOP_DEFAULTS.edgeRaysVocalBalance,
    motionEnabled:
      getSetting<boolean>("motionEnabled") ??
      item.motionEnabled ??
      CONTENT_LOOP_DEFAULTS.motionEnabled,
    motionAmountPx:
      getSetting<number>("motionAmountPx") ??
      item.motionAmountPx ??
      CONTENT_LOOP_DEFAULTS.motionAmountPx,
    motionSpeed:
      getSetting<number>("motionSpeed") ??
      item.motionSpeed ??
      CONTENT_LOOP_DEFAULTS.motionSpeed,
    motionAttack:
      getSetting<number>("motionAttack") ??
      item.motionAttack ??
      CONTENT_LOOP_DEFAULTS.motionAttack,
    motionRelease:
      getSetting<number>("motionRelease") ??
      item.motionRelease ??
      CONTENT_LOOP_DEFAULTS.motionRelease,
    sharpenEnabled:
      getSetting<boolean>("sharpenEnabled") ??
      item.sharpenEnabled ??
      CONTENT_LOOP_DEFAULTS.sharpenEnabled,
    sharpenAmount:
      getSetting<number>("sharpenAmount") ??
      item.sharpenAmount ??
      CONTENT_LOOP_DEFAULTS.sharpenAmount,
    sharpenUseMaster:
      getSetting<boolean>("sharpenUseMaster") ??
      item.sharpenUseMaster ??
      CONTENT_LOOP_DEFAULTS.sharpenUseMaster,
    sharpenMaster:
      getSetting<number>("sharpenMaster") ??
      getSetting<number>("sharpenAmount") ??
      item.sharpenMaster ??
      item.sharpenAmount ??
      CONTENT_LOOP_DEFAULTS.sharpenMaster,
    sharpenContrastWeight:
      getSetting<number>("sharpenContrastWeight") ??
      item.sharpenContrastWeight ??
      CONTENT_LOOP_DEFAULTS.sharpenContrastWeight,
    sharpenSaturationWeight:
      getSetting<number>("sharpenSaturationWeight") ??
      item.sharpenSaturationWeight ??
      CONTENT_LOOP_DEFAULTS.sharpenSaturationWeight,
    sharpenBrightnessWeight:
      getSetting<number>("sharpenBrightnessWeight") ??
      item.sharpenBrightnessWeight ??
      CONTENT_LOOP_DEFAULTS.sharpenBrightnessWeight,
    videoDurationSeconds:
      getSetting<number>("videoDurationSeconds") ??
      item.videoDurationSeconds ??
      CONTENT_LOOP_DEFAULTS.videoDurationSeconds,
    overlapRatio:
      getSetting<number>("overlapRatio") ??
      item.overlapRatio ??
      CONTENT_LOOP_DEFAULTS.overlapRatio,
    captionsEnabled:
      getSetting<boolean>("captionsEnabled") ??
      item.captionsEnabled ??
      CONTENT_LOOP_DEFAULTS.captionsEnabled,
    captionsStyle:
      getSetting<"subtitle" | "tiktok">("captionsStyle") ??
      item.captionsStyle ??
      CONTENT_LOOP_DEFAULTS.captionsStyle,
    captionsData:
      captionsData ?? CONTENT_LOOP_DEFAULTS.captionsData,
    playbackRate:
      getSetting<number>("playbackRate") ??
      item.playbackRate ??
      CONTENT_LOOP_DEFAULTS.playbackRate,
    scalePercent:
      getSetting<number>("scalePercent") ??
      item.scalePercent ??
      CONTENT_LOOP_DEFAULTS.scalePercent,
    colorPalette: item.colorPalette ?? CONTENT_LOOP_DEFAULTS.colorPalette,
    songDurationSeconds:
      getSetting<number>("songDurationSeconds") ??
      item.songDurationSeconds ??
      CONTENT_LOOP_DEFAULTS.songDurationSeconds,
    fps:
      getSetting<number>("fps") ??
      CONTENT_LOOP_DEFAULTS.fps,
    width:
      getSetting<number>("width") ??
      CONTENT_LOOP_DEFAULTS.width,
    height:
      getSetting<number>("height") ??
      CONTENT_LOOP_DEFAULTS.height,
    ...overrides,
  });
};

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
