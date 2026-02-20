import { z } from "zod";
import type { ContentItem } from "@/types";
import type { ContentLoopProps } from "@/types";
import { buildContentLoopPropsFromItem } from "@/remotion/content-loop-props";

const getSharedCaptionsData = (settings: unknown): ContentLoopProps["captionsData"] => {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return null;
  }
  const shared = (settings as Record<string, unknown>).__shared;
  if (!shared || typeof shared !== "object" || Array.isArray(shared)) {
    return null;
  }
  return (
    (shared as Record<string, unknown>).captionsData as
      | ContentLoopProps["captionsData"]
      | undefined
  ) ?? null;
};

export type ContentModeDefinition<TSettings extends z.ZodTypeAny, TProps> = {
  id: string;
  label: string;
  description: string;
  requiredAssets: Array<"thumbnail" | "video" | "song">;
  schema: TSettings;
  defaults: z.infer<TSettings>;
  compositionId: string;
  buildProps: (ctx: {
    item: ContentItem;
    settings: z.infer<TSettings>;
    assets: {
      thumbnailSrc: string;
      videoSrc: string;
      audioSrc: string;
    };
  }) => TProps;
};

export const OUTPUT_PRESET_DEFAULTS = {
  landscape_hd: { width: 1280, height: 720 },
  landscape_fhd: { width: 1920, height: 1080 },
  landscape_qhd: { width: 2560, height: 1440 },
  portrait_hd: { width: 720, height: 1280 },
  portrait_fhd: { width: 1080, height: 1920 },
  portrait_qhd: { width: 1440, height: 2560 },
} as const;

export type OutputPresetId = keyof typeof OUTPUT_PRESET_DEFAULTS;
export type OutputConfigPresetId = OutputPresetId | "custom";

export const getOutputDefaultsForMode = (
  mode: string | undefined,
  settings: unknown
) => {
  const normalizedMode = (mode ?? "").toLowerCase();
  const isShortMode =
    normalizedMode.includes("short") || normalizedMode.includes("portrait");
  const fallbackPreset: OutputPresetId =
    isShortMode ? "portrait_fhd" : "landscape_hd";
  const scoped =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : {};
  const rawOutputConfig =
    scoped.outputConfig &&
    typeof scoped.outputConfig === "object" &&
    !Array.isArray(scoped.outputConfig)
      ? (scoped.outputConfig as Record<string, unknown>)
      : {};
  const presetCandidate = rawOutputConfig.preset;
  const preset =
    typeof presetCandidate === "string" ? presetCandidate : fallbackPreset;
  const basePreset =
    preset in OUTPUT_PRESET_DEFAULTS
      ? (preset as OutputPresetId)
      : fallbackPreset;
  const base = OUTPUT_PRESET_DEFAULTS[basePreset];
  const toPositiveInt = (value: unknown, fallback: number) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.round(parsed);
  };
  return {
    preset,
    fps: toPositiveInt(rawOutputConfig.fps, 60),
    width: toPositiveInt(rawOutputConfig.width, base.width),
    height: toPositiveInt(rawOutputConfig.height, base.height),
  };
};

export const videoLoopSettingsSchema = z
  .object({
    segmentDurationSeconds: z.number().nonnegative().default(4),
    videoDurationSeconds: z.number().nonnegative().nullable().default(null),
    fadeDurationSeconds: z.number().nonnegative().default(1),
    introFadeSeconds: z.number().nonnegative().default(0),
    outroFadeSeconds: z.number().nonnegative().default(0),
    audioFadeInSeconds: z.number().nonnegative().default(0),
    audioFadeOutSeconds: z.number().nonnegative().default(0),
    audioFadeInOffsetSeconds: z.number().nonnegative().default(0),
    audioFadeOutOffsetSeconds: z.number().nonnegative().default(0),
    scalePercent: z.number().nonnegative().default(100),
    visualizationEnabled: z.boolean().default(true),
    visualizationBars: z.number().int().min(16).max(128).default(128),
    edgeRaysEnabled: z.boolean().default(true),
    edgeRaysIntensity: z.number().min(0).max(1).default(0.3),
    edgeRaysVocalBalance: z.number().min(0).max(1).default(0.6),
    motionEnabled: z.boolean().default(false),
    motionAmountPx: z.number().min(0.5).max(16).default(4),
    motionSpeed: z.number().min(0.1).max(4).default(0.6),
    motionAttack: z.number().min(0.1).max(0.99).default(0.9),
    motionRelease: z.number().min(0.01).max(0.9).default(0.32),
    sharpenEnabled: z.boolean().default(false),
    sharpenAmount: z.number().min(0).max(1).default(0.4),
    sharpenUseMaster: z.boolean().default(true),
    sharpenMaster: z.number().min(0).max(1).default(0.4),
    sharpenContrastWeight: z.number().min(0).max(1).default(0.45),
    sharpenSaturationWeight: z.number().min(0).max(1).default(0.2),
    sharpenBrightnessWeight: z.number().min(0).max(0.5).default(0.03),
    overlapRatio: z.number().min(0).max(0.9).default(0.25),
    playbackRate: z.number().positive().default(1),
    outputConfig: z
      .object({
        preset: z
          .enum([
            "landscape_hd",
            "landscape_fhd",
            "landscape_qhd",
            "portrait_hd",
            "portrait_fhd",
            "portrait_qhd",
            "custom",
          ])
          .default("landscape_hd"),
        fps: z.number().int().positive().optional(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
      })
      .default({ preset: "landscape_hd" }),
    captionsEnabled: z.boolean().default(false),
    captionsLanguage: z.string().min(2).max(16).default("en"),
    captionsStyle: z
      .enum(["subtitle", "tiktok"])
      .default("subtitle"),
    paletteModeOverride: z.enum(["auto", "manual"]).optional(),
    paletteOverride: z.array(z.string()).optional(),
  })
  .strict();

export const contentModeRegistry = {
  video_loop: {
    id: "video_loop",
    label: "Video Loop",
    description: "Loop a video segment with audio-reactive visuals.",
    requiredAssets: ["thumbnail", "video", "song"],
    schema: videoLoopSettingsSchema,
    defaults: videoLoopSettingsSchema.parse({}),
    compositionId: "ContentLoop",
    buildProps: ({ item, settings, assets }) => {
      const sharedCaptionsData = getSharedCaptionsData(item.settings ?? {});
      return buildContentLoopPropsFromItem(
        {
          ...item,
          settings: settings as Record<string, unknown>,
        },
        {
          thumbnailSrc: assets.thumbnailSrc,
          videoSrc: assets.videoSrc,
          audioSrc: assets.audioSrc,
          videoDurationSeconds:
            (settings as z.infer<typeof videoLoopSettingsSchema>).videoDurationSeconds ??
            undefined,
          overlapRatio:
            (settings as z.infer<typeof videoLoopSettingsSchema>).overlapRatio ?? null,
          playbackRate:
            (settings as z.infer<typeof videoLoopSettingsSchema>).playbackRate ?? 1,
          scalePercent:
            (settings as z.infer<typeof videoLoopSettingsSchema>).scalePercent ?? 100,
          colorPalette:
            (settings as z.infer<typeof videoLoopSettingsSchema>).paletteOverride ??
            item.colorPalette ??
            undefined,
          captionsData: sharedCaptionsData,
        }
      ) as ContentLoopProps;
    },
  },
  video_loop_short: {
    id: "video_loop_short",
    label: "Video Loop (Short)",
    description: "Portrait-first short video loop with audio-reactive visuals.",
    requiredAssets: ["thumbnail", "video", "song"],
    schema: videoLoopSettingsSchema,
    defaults: videoLoopSettingsSchema.parse({
      scalePercent: 110,
      outputConfig: {
        preset: "portrait_fhd",
      },
    }),
    compositionId: "ContentLoop",
    buildProps: ({ item, settings, assets }) => {
      const sharedCaptionsData = getSharedCaptionsData(item.settings ?? {});
      return buildContentLoopPropsFromItem(
        {
          ...item,
          settings: settings as Record<string, unknown>,
        },
        {
          thumbnailSrc: assets.thumbnailSrc,
          videoSrc: assets.videoSrc,
          audioSrc: assets.audioSrc,
          videoDurationSeconds:
            (settings as z.infer<typeof videoLoopSettingsSchema>).videoDurationSeconds ??
            undefined,
          overlapRatio:
            (settings as z.infer<typeof videoLoopSettingsSchema>).overlapRatio ?? null,
          playbackRate:
            (settings as z.infer<typeof videoLoopSettingsSchema>).playbackRate ?? 1,
          scalePercent:
            (settings as z.infer<typeof videoLoopSettingsSchema>).scalePercent ?? 110,
          colorPalette:
            (settings as z.infer<typeof videoLoopSettingsSchema>).paletteOverride ??
            item.colorPalette ??
            undefined,
          captionsData: sharedCaptionsData,
        }
      ) as ContentLoopProps;
    },
  },
} satisfies Record<string, ContentModeDefinition<z.ZodTypeAny, unknown>>;

export type ContentModeId = keyof typeof contentModeRegistry;
