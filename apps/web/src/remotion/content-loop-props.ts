import type { ContentLoopProps, VideoLoopSettings } from "../types";
import { captionDocumentSchema } from "../types";
import { getOutputDefaultsForMode } from "../lib/content/modes";

export const CONTENT_LOOP_DEFAULTS: ContentLoopProps = {
  title: "Content Loop",
  thumbnailSrc: "",
  videoSrc: "",
  audioSrc: "",
  previewMode: "full",
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
  videoDurationSeconds: null,
  playbackRate: 1,
  captionsEnabled: false,
  captionsStyle: "subtitle",
  captionsPosition: "bottom",
  captionsOffsetX: 0,
  captionsOffsetY: 0,
  captionsScalePercent: 100,
  captionsAnimationPreset: "smooth",
  captionsWordsPerPage: 4,
  captionsData: null,
  renderShaderEnabled: false,
  renderShaderDebugMode: "none",
  songDurationSeconds: 30,
  songRangeStartSeconds: 0,
  songRangeEndSeconds: null,
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

type ContentLoopItemLike = Partial<VideoLoopSettings> & {
  mode?: string | null;
  title?: string | null;
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

  const outputConfig = getOutputDefaultsForMode(item.mode ?? undefined, settings);

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
      getSetting<number | null>("videoDurationSeconds") ??
      item.videoDurationSeconds ??
      CONTENT_LOOP_DEFAULTS.videoDurationSeconds,
    captionsEnabled:
      getSetting<boolean>("captionsEnabled") ??
      item.captionsEnabled ??
      CONTENT_LOOP_DEFAULTS.captionsEnabled,
    captionsStyle:
      getSetting<"subtitle" | "tiktok">("captionsStyle") ??
      item.captionsStyle ??
      CONTENT_LOOP_DEFAULTS.captionsStyle,
    captionsPosition:
      getSetting<"top" | "center" | "bottom" | "custom">("captionsPosition") ??
      item.captionsPosition ??
      CONTENT_LOOP_DEFAULTS.captionsPosition,
    captionsOffsetX:
      getSetting<number>("captionsOffsetX") ??
      item.captionsOffsetX ??
      CONTENT_LOOP_DEFAULTS.captionsOffsetX,
    captionsOffsetY:
      getSetting<number>("captionsOffsetY") ??
      item.captionsOffsetY ??
      CONTENT_LOOP_DEFAULTS.captionsOffsetY,
    captionsScalePercent:
      getSetting<number>("captionsScalePercent") ??
      item.captionsScalePercent ??
      CONTENT_LOOP_DEFAULTS.captionsScalePercent,
    captionsAnimationPreset:
      getSetting<"smooth" | "cinematic" | "punch" | "minimal">(
        "captionsAnimationPreset"
      ) ??
      item.captionsAnimationPreset ??
      CONTENT_LOOP_DEFAULTS.captionsAnimationPreset,
    captionsWordsPerPage:
      getSetting<number>("captionsWordsPerPage") ??
      item.captionsWordsPerPage ??
      CONTENT_LOOP_DEFAULTS.captionsWordsPerPage,
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
      item.songDurationSeconds ?? CONTENT_LOOP_DEFAULTS.songDurationSeconds,
    songRangeStartSeconds:
      getSetting<number>("songRangeStartSeconds") ??
      item.songRangeStartSeconds ??
      CONTENT_LOOP_DEFAULTS.songRangeStartSeconds,
    songRangeEndSeconds:
      getSetting<number>("songRangeEndSeconds") ??
      item.songRangeEndSeconds ??
      CONTENT_LOOP_DEFAULTS.songRangeEndSeconds,
    fps: outputConfig.fps,
    width: outputConfig.width,
    height: outputConfig.height,
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
  const rangeStart = Math.max(0, Number(props.songRangeStartSeconds ?? 0));
  const rangeEndRaw = Number(props.songRangeEndSeconds ?? songDurationSeconds);
  const rangeEnd = Math.max(rangeStart + 0.001, Math.min(songDurationSeconds, rangeEndRaw));
  const effectiveDurationSeconds = Math.max(0.001, rangeEnd - rangeStart);
  const durationInFrames = Math.max(1, Math.round(effectiveDurationSeconds * fps!));

  return {
    fps,
    width,
    height,
    durationInFrames,
    props,
  };
};
