import { z } from "zod";

export const contentItemSchema = z.object({
  id: z.uuid(),
  userId: z.string().min(1),
  title: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  colorPalette: z.array(z.string()).optional().nullable(),
  paletteMode: z.enum(["auto", "manual"]).default("auto"),
  mode: z.string().default("video_loop"),
  settings: z.record(z.string(), z.unknown()).optional().nullable(),
  status: z.enum(["uploaded", "rendering", "rendered", "failed"]),
  songDurationSeconds: z.number().nonnegative(),
  fps: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  publishesCount: z.number().int().nonnegative().optional(),
});

export const contentListResponseSchema = z.object({
  items: z.array(contentItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});

export const contentQuerySchema = z.object({
  q: z.string().trim().optional().default(""),
  status: z.enum(["uploaded", "rendering", "rendered", "failed"]).optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "title", "status"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export const contentCreateSchema = z.object({
  id: z.uuid(),
  userId: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(["uploaded", "rendering", "rendered", "failed"]).default("uploaded"),
  colorPalette: z.array(z.string()).optional().nullable(),
  paletteMode: z.enum(["auto", "manual"]).default("auto"),
  mode: z.string().default("video_loop"),
  settings: z.record(z.string(), z.unknown()).optional().nullable(),
  songDurationSeconds: z.number().nonnegative().default(0),
  fps: z.number().int().positive().default(30),
  width: z.number().int().positive().default(1280),
  height: z.number().int().positive().default(720),
});

export const contentUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  status: z.enum(["uploaded", "rendering", "rendered", "failed"]).optional(),
  colorPalette: z.array(z.string()).optional().nullable(),
  paletteMode: z.enum(["auto", "manual"]).optional(),
  mode: z.string().optional(),
  settings: z.record(z.string(), z.unknown()).optional().nullable(),
  songDurationSeconds: z.number().nonnegative().optional(),
  fps: z.number().int().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export const contentCreateFormSchema = z.object({
  title: z.string().default("Untitled"),
  mode: z.string().default("video_loop"),
  settings: z.string().optional(),
  fps: z.coerce.number().int().positive().default(30),
  width: z.coerce.number().int().positive().default(1280),
  height: z.coerce.number().int().positive().default(720),
});

export const contentUpdateFormSchema = z.object({
  title: z.string().optional(),
  status: z.string().optional(),
  paletteMode: z.enum(["auto", "manual"]).optional(),
  fps: z.coerce.number().int().positive().optional(),
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional(),
  mode: z.string().optional(),
  settings: z.string().optional(),
});

export const parseContentSettingsString = (value?: string | null) => {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
};
