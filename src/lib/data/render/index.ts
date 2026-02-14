import { z } from "zod";

export const renderBackendSchema = z.enum(["local", "lambda"]);
export const triggerRenderRequestSchema = z.object({
  backend: renderBackendSchema.optional(),
});

export const renderProgressSchema = z.object({
  id: z.string(),
  rendered: z.number(),
  total: z.number(),
  progress: z.number(),
  eta: z.string().optional(),
  updatedAt: z.number().optional(),
});

export const renderProgressMapResponseSchema = z.object({
  items: z.record(z.string(), renderProgressSchema).optional(),
});

export const rescanResponseSchema = z.object({
  created: z.number(),
  skipped: z.number(),
  errors: z.array(z.string()),
});

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
    })
  ),
});

export const triggerRenderResponseSchema = z.object({
  ok: z.boolean(),
  status: z.string(),
  id: z.string(),
  backend: renderBackendSchema.optional(),
});
