import { z } from "zod";

export const settingsCaptionBackendSchema = z.enum(["openai", "local"]);

export const appSettingsSchema = z.object({
  captions: z
    .object({
      backend: settingsCaptionBackendSchema.optional(),
    })
    .default({}),
});

export const appSettingsUpdateSchema = z.object({
  captions: z
    .object({
      backend: settingsCaptionBackendSchema.optional(),
    })
    .optional(),
});

export const settingsResponseSchema = z.object({
  storage: z.object({
    baseDir: z.string(),
    uploadsDir: z.string(),
    rendersDir: z.string(),
    manifestsDir: z.string(),
    uploadsCount: z.number(),
    rendersCount: z.number(),
    manifestsCount: z.number(),
  }),
  stats: z.object({
    total: z.number(),
    uploaded: z.number(),
    rendering: z.number(),
    rendered: z.number(),
    failed: z.number(),
  }),
  captions: z.object({
    backend: settingsCaptionBackendSchema,
    defaultLanguage: z.string(),
    autoOnUpload: z.boolean(),
    localModel: z.string().optional(),
  }),
});

export const settingsUpdateRequestSchema = z.object({
  captions: z.object({
    backend: settingsCaptionBackendSchema,
  }),
});

export const settingsUpdateResponseSchema = z.object({
  ok: z.literal(true),
  settings: settingsResponseSchema,
});

