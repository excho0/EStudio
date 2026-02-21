import { z } from "zod";
import type { ContentItem } from "@/types";
import type { ContentLoopProps } from "@/types";
import { buildContentLoopPropsFromItem } from "@/remotion/content-loop-props";
import { videoLoopSettingsSchema } from "./schemas";

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
