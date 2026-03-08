import { z } from "zod";

/** Rendering backend selector. */
export const renderBackendSchema = z
  .enum(["local", "lambda"])
  .describe("Render backend.");
/** Trigger render request payload. */
export const triggerRenderRequestSchema = z.object({
  backend: renderBackendSchema.optional(),
  mode: z.string().min(1).optional(),
}).describe("Trigger render request.");

/** Per-content render progress snapshot payload. */
export const renderProgressSchema = z.object({
  id: z.string(),
  jobId: z.string().optional(),
  mode: z.string().optional(),
  key: z.string().optional(),
  rendered: z.number(),
  total: z.number(),
  progress: z.number(),
  eta: z.string().optional(),
  updatedAt: z.number().optional(),
}).describe("Render progress snapshot.");

/** Render progress map API response keyed by content ID. */
export const renderProgressMapResponseSchema = z.object({
  items: z.record(z.string(), renderProgressSchema).optional(),
}).describe("Render progress map response.");

/** Response for content rescan action. */
export const rescanResponseSchema = z.object({
  created: z.number(),
  skipped: z.number(),
  errors: z.array(z.string()),
}).describe("Rescan response.");

/** Paginated content renders response. */
export const rendersResponseSchema = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  items: z.array(
    z.object({
      name: z.string(),
      size: z.number(),
      mtimeMs: z.number(),
      assetUrl: z.string(),
      thumbnailUrl: z.string().nullable().optional(),
    })
  ),
}).describe("Renders response.");

/** Trigger render endpoint response. */
export const triggerRenderResponseSchema = z.object({
  ok: z.boolean(),
  status: z.string(),
  id: z.string(),
  jobId: z.string().optional(),
  backend: renderBackendSchema.optional(),
  mode: z.string().optional(),
}).describe("Trigger render response.");
