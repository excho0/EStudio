import { z } from "zod";

export const outputConfigSchema = z
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
  .default({ preset: "landscape_hd" });

export const videoLoopSettingsSchema = z
  .object({
    segmentDurationSeconds: z.number().nonnegative().default(4),
    videoDurationSeconds: z.number().nonnegative().nullable().default(null),
    songRangeStartSeconds: z.number().nonnegative().default(0),
    songRangeEndSeconds: z.number().nonnegative().nullable().default(null),
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
    playbackRate: z.number().positive().default(1),
    outputConfig: outputConfigSchema,
    captionsEnabled: z.boolean().default(false),
    captionsLanguage: z.string().min(2).max(16).default("en"),
    captionsStyle: z.enum(["subtitle", "tiktok"]).default("subtitle"),
    captionsPosition: z.enum(["top", "center", "bottom", "custom"]).default("bottom"),
    captionsOffsetX: z.number().min(-600).max(600).default(0),
    captionsOffsetY: z.number().min(-1200).max(1200).default(0),
    captionsScalePercent: z.number().min(50).max(200).default(100),
    captionsAnimationPreset: z
      .enum(["smooth", "cinematic", "punch", "minimal"])
      .default("smooth"),
    captionsWordsPerPage: z.number().int().min(1).max(12).default(4),
    paletteModeOverride: z.enum(["auto", "manual"]).optional(),
    paletteOverride: z.array(z.string()).optional(),
  })
  .strict();
