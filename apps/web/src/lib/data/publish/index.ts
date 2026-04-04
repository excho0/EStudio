import { z } from "zod";

/** Allowed publish privacy states. */
export const publishPrivacySchema = z
  .enum(["public", "unlisted", "private"])
  .describe("Publish privacy.");

/** Generic publish options accepted by provider flows. */
export const publishOptionsSchema = z.object({
  privacy: publishPrivacySchema.optional(),
  scheduleAt: z.string().nullable().optional(),
  containsSyntheticMedia: z.boolean().optional(),
}).describe("Publish options.");

// Payload metadata sent to providers.
export const publishMetadataSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  categoryId: z.string().optional(),
}).describe("Provider publish metadata.");

// Metadata snapshot stored with publish records and shown in studio UI.
export const studioPublishMetadataSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  thumbnailUrl: z.string().optional(),
  thumbnailAssetPath: z.string().optional(),
  options: publishOptionsSchema
    .extend({
      privacy: z.string().optional(),
    })
    .optional(),
}).describe("Studio publish metadata snapshot.");

/** Publish lifecycle status stored on records. */
export const publishStatusSchema = z.enum([
  "draft",
  "queued",
  "publishing",
  "published",
  "published_with_warning",
  "failed",
  "deleted",
]).describe("Publish status.");

/** Persisted publish record. */
export const publishRecordSchema = z
  .object({
    id: z.string(),
    renderId: z.string(),
    provider: z.string(),
    status: publishStatusSchema,
    providerAccountId: z.string().nullable().optional(),
    providerAssetId: z.string().nullable(),
    metadata: z.string().nullable(),
    error: z.string().nullable().optional(),
    updatedAt: z.union([z.number(), z.string(), z.date(), z.null()]).optional(),
    createdAt: z.union([z.number(), z.string(), z.date(), z.null()]).optional(),
  })
  .loose()
  .describe("Publish record.");

/** Provider/target descriptor returned for publish UIs. */
export const publishTargetSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    status: z.string().optional(),
    connected: z.boolean().optional(),
    connectionId: z.string().nullable().optional(),
  })
  .loose()
  .describe("Publish target/provider summary.");

/** Response for content publishes endpoint. */
export const contentPublishesResponseSchema = z.object({
  publishes: z.array(publishRecordSchema),
  publishTargets: z.array(publishTargetSchema),
}).describe("Content publishes response.");

/** Response for create publish endpoint. */
export const createPublishResponseSchema = z.object({
  publish: publishRecordSchema,
}).describe("Create publish response.");

/** Response for retry publish endpoint. */
export const retryPublishResponseSchema = z.object({
  queued: z.boolean(),
}).describe("Retry publish response.");

/** Publish progress stage emitted by provider uploads. */
export const publishProgressStageSchema = z.enum([
  "uploading",
  "processing",
  "thumbnail",
  "complete",
]).describe("Publish progress stage.");

/** Progress payload for publish processing. */
export const publishProgressSchema = z.object({
  stage: publishProgressStageSchema,
  progress: z.number().optional(),
  bytesUploaded: z.number().optional(),
  bytesTotal: z.number().optional(),
}).describe("Publish progress payload.");

/** Status values returned by provider publish results. */
export const publishResultStatusSchema = z.enum([
  "queued",
  "publishing",
  "published",
  "failed",
  "published_with_warning",
]).describe("Publish result status.");

/** Final/partial provider publish result. */
export const publishResultSchema = z.object({
  providerAssetId: z.string(),
  providerUrl: z.string().optional(),
  status: publishResultStatusSchema.optional(),
  warning: z.string().optional(),
}).describe("Publish result.");

/** Response for publish providers/targets endpoint. */
export const publishProvidersResponseSchema = z.object({
  publishTargets: z.array(publishTargetSchema),
}).describe("Publish providers response.");

/** Response describing a single provider connection state. */
export const publishProviderResponseSchema = z
  .object({
    connected: z.boolean(),
    needsReconnect: z.boolean().optional(),
    channel: z
      .object({
        id: z.string().nullable().optional(),
        title: z.string().nullable().optional(),
        thumbnail: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
  })
  .loose()
  .describe("Provider connection response.");
