import { contentModeRegistry, type ContentModeId } from "./registry";

export const DEFAULT_CONTENT_MODE: ContentModeId = "video_loop";

export const getContentMode = (mode?: string) =>
  contentModeRegistry[(mode ?? DEFAULT_CONTENT_MODE) as ContentModeId] ??
  contentModeRegistry[DEFAULT_CONTENT_MODE];

const isSettingsMap = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return Object.keys(value).some((key) => key in contentModeRegistry);
};

export const normalizeSettingsMap = (mode: string | undefined, settings: unknown) => {
  const definition = getContentMode(mode);
  if (isSettingsMap(settings)) {
    return settings as Record<string, Record<string, unknown>>;
  }
  const base =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : {};
  return { [definition.id]: base };
};

export const resolveContentSettings = (mode: string | undefined, settings: unknown) => {
  const definition = getContentMode(mode);
  const settingsMap = normalizeSettingsMap(definition.id, settings);
  const scoped = settingsMap[definition.id] ?? {};
  const cleaned =
    scoped && typeof scoped === "object"
      ? {
          ...(scoped as Record<string, unknown>),
        }
      : {};
  delete cleaned.songDurationSeconds;
  delete cleaned.fps;
  delete cleaned.width;
  delete cleaned.height;
  const parsed = definition.schema.safeParse(cleaned ?? {});
  if (!parsed.success) {
    throw new Error(parsed.error.message);
  }
  return {
    mode: definition.id,
    settings: parsed.data,
  };
};

export const mergeContentSettings = (
  mode: string | undefined,
  base: unknown,
  patch: unknown
) => {
  const definition = getContentMode(mode);
  const settingsMap = normalizeSettingsMap(definition.id, base);
  const patchMap = normalizeSettingsMap(definition.id, patch);
  const merged = {
    ...(settingsMap[definition.id] ?? {}),
  } as Record<string, unknown>;
  Object.assign(merged, patchMap[definition.id] ?? {});
  delete merged.songDurationSeconds;
  delete merged.fps;
  delete merged.width;
  delete merged.height;
  const parsed = definition.schema.safeParse(merged);
  if (!parsed.success) {
    throw new Error(parsed.error.message);
  }
  return {
    mode: definition.id,
    settings: parsed.data,
  };
};

export const settingsToLegacyColumns = (mode: string, settings: unknown) => {
  if (mode !== "video_loop") return {};
  const parsed = contentModeRegistry.video_loop.schema.safeParse(settings);
  if (!parsed.success) return {};
  const value = parsed.data;
  return {
    songDurationSeconds: value.songDurationSeconds,
    segmentDurationSeconds: value.segmentDurationSeconds,
    videoDurationSeconds: value.videoDurationSeconds,
    fadeDurationSeconds: value.fadeDurationSeconds,
    introFadeSeconds: value.introFadeSeconds,
    outroFadeSeconds: value.outroFadeSeconds,
    audioFadeInSeconds: value.audioFadeInSeconds,
    audioFadeOutSeconds: value.audioFadeOutSeconds,
    audioFadeInOffsetSeconds: value.audioFadeInOffsetSeconds,
    audioFadeOutOffsetSeconds: value.audioFadeOutOffsetSeconds,
    scalePercent: value.scalePercent,
    visualizationEnabled: value.visualizationEnabled,
    visualizationBars: value.visualizationBars,
    edgeRaysEnabled: value.edgeRaysEnabled,
    edgeRaysIntensity: value.edgeRaysIntensity,
    edgeRaysVocalBalance: value.edgeRaysVocalBalance,
    overlapRatio: value.overlapRatio,
    playbackRate: value.playbackRate,
  };
};

export const legacyColumnsToSettings = (mode: string, legacy: Record<string, unknown>) => {
  if (mode !== "video_loop") return {};
  const value: Record<string, unknown> = {
    songDurationSeconds: legacy.songDurationSeconds,
    segmentDurationSeconds: legacy.segmentDurationSeconds,
    videoDurationSeconds: legacy.videoDurationSeconds,
    fadeDurationSeconds: legacy.fadeDurationSeconds,
    introFadeSeconds: legacy.introFadeSeconds,
    outroFadeSeconds: legacy.outroFadeSeconds,
    audioFadeInSeconds: legacy.audioFadeInSeconds,
    audioFadeOutSeconds: legacy.audioFadeOutSeconds,
    audioFadeInOffsetSeconds: legacy.audioFadeInOffsetSeconds,
    audioFadeOutOffsetSeconds: legacy.audioFadeOutOffsetSeconds,
    scalePercent: legacy.scalePercent,
    visualizationEnabled: legacy.visualizationEnabled,
    visualizationBars: legacy.visualizationBars,
    edgeRaysEnabled: legacy.edgeRaysEnabled,
    edgeRaysIntensity: legacy.edgeRaysIntensity,
    edgeRaysVocalBalance: legacy.edgeRaysVocalBalance,
    overlapRatio: legacy.overlapRatio,
    playbackRate: legacy.playbackRate,
  };
  Object.keys(value).forEach((key) => {
    if (value[key] === undefined) {
      delete value[key];
    }
  });
  const parsed = contentModeRegistry.video_loop.schema.safeParse(value);
  return parsed.success ? parsed.data : {};
};
