import { z } from "zod";

export const publishRecordSchema = z
  .object({
    id: z.string(),
    renderId: z.string(),
    provider: z.string(),
    status: z.string(),
    providerAccountId: z.string().nullable().optional(),
    providerAssetId: z.string().nullable(),
    metadata: z.string().nullable(),
    error: z.string().nullable().optional(),
    updatedAt: z.union([z.number(), z.string(), z.date(), z.null()]).optional(),
    createdAt: z.union([z.number(), z.string(), z.date(), z.null()]).optional(),
  })
  .loose();

export const publishTargetSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    status: z.string().optional(),
    connected: z.boolean().optional(),
    connectionId: z.string().nullable().optional(),
  })
  .loose();

export const contentPublishesResponseSchema = z.object({
  publishes: z.array(publishRecordSchema),
  publishTargets: z.array(publishTargetSchema),
});

export const createPublishResponseSchema = z.object({
  publish: publishRecordSchema,
});

export const retryPublishResponseSchema = z.object({
  queued: z.boolean(),
});

export const publishProvidersResponseSchema = z.object({
  publishTargets: z.array(publishTargetSchema),
});

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
  .loose();
