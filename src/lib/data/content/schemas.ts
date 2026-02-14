import { z } from "zod";

/** Palette selection mode for content color styling. */
export const paletteModeSchema = z
  .enum(["auto", "manual"])
  .describe("Palette selection mode.");

/** Canonical content item returned by API/data layer. */
export const contentItemSchema = z.object({
  id: z.uuid(),
  userId: z.string().min(1),
  title: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  colorPalette: z.array(z.string()).optional().nullable(),
  paletteMode: paletteModeSchema.default("auto"),
  mode: z.string().default("video_loop"),
  settings: z.record(z.string(), z.unknown()).optional().nullable(),
  status: z.enum(["uploaded", "rendering", "rendered", "failed"]),
  songDurationSeconds: z.number().nonnegative(),
  fps: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  publishesCount: z.number().int().nonnegative().optional(),
}).describe("Content item.");

/** Paginated content listing response. */
export const contentListResponseSchema = z.object({
  items: z.array(contentItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
}).describe("Paginated content list response.");

/** Query params accepted by content listing API. */
export const contentQuerySchema = z.object({
  q: z.string().trim().optional().default(""),
  status: z.enum(["uploaded", "rendering", "rendered", "failed"]).optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "title", "status"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
}).describe("Content listing query.");

/** Data shape used when creating a content item in persistence layer. */
export const contentCreateSchema = z.object({
  id: z.uuid(),
  userId: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(["uploaded", "rendering", "rendered", "failed"]).default("uploaded"),
  colorPalette: z.array(z.string()).optional().nullable(),
  paletteMode: paletteModeSchema.default("auto"),
  mode: z.string().default("video_loop"),
  settings: z.record(z.string(), z.unknown()).optional().nullable(),
  songDurationSeconds: z.number().nonnegative().default(0),
  fps: z.number().int().positive().default(30),
  width: z.number().int().positive().default(1280),
  height: z.number().int().positive().default(720),
}).describe("Content create payload.");

/** Data shape used when partially updating a content item in persistence layer. */
export const contentUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  status: z.enum(["uploaded", "rendering", "rendered", "failed"]).optional(),
  colorPalette: z.array(z.string()).optional().nullable(),
  paletteMode: paletteModeSchema.optional(),
  mode: z.string().optional(),
  settings: z.record(z.string(), z.unknown()).optional().nullable(),
  songDurationSeconds: z.number().nonnegative().optional(),
  fps: z.number().int().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
}).describe("Content update payload.");

/** Multipart/form-data create payload accepted by content create endpoint. */
export const contentCreateFormSchema = z.object({
  title: z.string().default("Untitled"),
  mode: z.string().default("video_loop"),
  settings: z.string().optional(),
  fps: z.coerce.number().int().positive().default(30),
  width: z.coerce.number().int().positive().default(1280),
  height: z.coerce.number().int().positive().default(720),
}).describe("Content create form payload.");

/** Multipart/form-data update payload accepted by content update endpoint. */
export const contentUpdateFormSchema = z.object({
  title: z.string().optional(),
  status: z.string().optional(),
  paletteMode: paletteModeSchema.optional(),
  fps: z.coerce.number().int().positive().optional(),
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional(),
  mode: z.string().optional(),
  settings: z.string().optional(),
}).describe("Content update form payload.");

/** UI edit form values used in studio editor state. */
export const editFormValuesSchema = z.object({
  title: z.string(),
  status: z.string(),
  mode: z.string(),
  songDurationSeconds: z.string(),
  fps: z.string(),
  width: z.string(),
  height: z.string(),
  settings: z.record(z.string(), z.unknown()),
}).describe("Studio edit form values.");

/** Parse serialized settings JSON safely and return object/null. */
export const parseContentSettingsString = (value?: string | null) => {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
};
