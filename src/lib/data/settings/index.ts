import { z } from "zod";

/** Settings API response including storage and content stats. */
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
}).describe("Settings response.");
