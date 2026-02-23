import { z } from "zod";

export const captionSegmentSchema = z.object({
  text: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
});

export const captionDocumentSchema = z.object({
  backend: z.string(),
  language: z.string().default("en"),
  generatedAt: z.string(),
  globalOffsetMs: z.number().int().default(0),
  segments: z.array(captionSegmentSchema),
});

export type CaptionSegment = z.infer<typeof captionSegmentSchema>;
export type CaptionDocument = z.infer<typeof captionDocumentSchema>;
