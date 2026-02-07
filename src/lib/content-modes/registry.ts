import { z } from "zod";
import type { ContentItem } from "@/types";
import type { ContentLoopProps } from "@/types";
import { buildContentLoopPropsFromItem } from "@/remotion/content-loop-props";

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

export const videoLoopSettingsSchema = z
  .object({
    songDurationSeconds: z.number().nonnegative().default(0),
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
    edgeRaysIntensity: z.number().min(0).max(1).default(0.85),
    edgeRaysVocalBalance: z.number().min(0).max(1).default(0.6),
    overlapRatio: z.number().min(0).max(0.9).default(0.25),
    playbackRate: z.number().positive().default(1),
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
    buildProps: ({ item, settings, assets }) =>
      buildContentLoopPropsFromItem(
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
        }
      ) as ContentLoopProps,
  },
} satisfies Record<string, ContentModeDefinition<z.ZodTypeAny, unknown>>;

export type ContentModeId = keyof typeof contentModeRegistry;
