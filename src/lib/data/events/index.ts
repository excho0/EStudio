import { z } from "zod";

import { renderBackendSchema } from "@/lib/data/render";

/** Generic content update event payload. */
export const contentUpdatePayloadSchema = z.object({
  userId: z.string().nullable().optional(),
  type: z.string(),
  id: z.string().optional(),
  jobId: z.string().optional(),
  status: z.string().optional(),
  item: z.unknown().optional(),
}).describe("Content update payload.");

/** Render queued event payload. */
export const renderQueuedPayloadSchema = z.object({
  userId: z.string(),
  id: z.string(),
  backend: renderBackendSchema.optional(),
  mode: z.string().optional(),
}).describe("Render queued payload.");

/** Render progress event payload. */
export const renderProgressPayloadSchema = z.object({
  userId: z.string().nullable().optional(),
  id: z.string(),
  jobId: z.string().optional(),
  mode: z.string().optional(),
  key: z.string().optional(),
  rendered: z.number(),
  total: z.number(),
  progress: z.number(),
  eta: z.string().optional(),
}).describe("Render progress payload.");

/** Render complete event payload. */
export const renderCompletePayloadSchema = z.object({
  userId: z.string().nullable().optional(),
  id: z.string(),
  jobId: z.string().optional(),
  mode: z.string().optional(),
  key: z.string().optional(),
  durationSeconds: z.number().optional(),
  avgFps: z.number().optional(),
}).describe("Render complete payload.");

/** Publish update event payload. */
export const publishUpdatePayloadSchema = z.object({
  userId: z.string().nullable().optional(),
  id: z.string(),
  jobId: z.string().optional(),
  status: z.string(),
  providerAssetId: z.string().optional(),
  error: z.string().optional(),
}).describe("Publish update payload.");

/** Publish progress event payload. */
export const publishProgressPayloadSchema = z.object({
  userId: z.string().nullable().optional(),
  id: z.string(),
  jobId: z.string().optional(),
  stage: z.string(),
  progress: z.number().optional(),
  bytesUploaded: z.number().optional(),
  bytesTotal: z.number().optional(),
}).describe("Publish progress payload.");

/** Publish queued event payload. */
export const publishQueuedPayloadSchema = z.object({
  userId: z.string(),
  id: z.string(),
  contentId: z.string(),
  provider: z.string(),
}).describe("Publish queued payload.");

/** Caption update event payload. */
export const captionUpdatePayloadSchema = z.object({
  userId: z.string().nullable().optional(),
  id: z.string(),
  jobId: z.string().optional(),
  mode: z.string().optional(),
  status: z.enum(["queued", "processing", "completed", "failed"]),
  progress: z.number().optional(),
  error: z.string().optional(),
}).describe("Caption update payload.");

/** Provider connection event payload. */
export const providerConnectionPayloadSchema = z.object({
  userId: z.string(),
  provider: z.string(),
  providerAccountId: z.string().nullable().optional(),
}).describe("Provider connection payload.");

/** User profile updated event payload. */
export const userProfileUpdatedPayloadSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  pendingEmail: z.string().nullable(),
}).describe("User profile updated payload.");
