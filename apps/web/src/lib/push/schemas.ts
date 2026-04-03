import { z } from "zod";

export const pushSubscriptionKeysSchema = z.object({
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

export const pushSubscriptionInputSchema = z.object({
  endpoint: z.url(),
  expirationTime: z.number().nullable().optional(),
  keys: pushSubscriptionKeysSchema,
  userAgent: z.string().optional(),
});

export const pushSubscriptionRecordSchema = z.object({
  id: z.string(),
  userId: z.string(),
  endpoint: z.url(),
  expirationTime: z.number().nullable().optional(),
  keys: pushSubscriptionKeysSchema,
  userAgent: z.string().nullable().optional(),
  lastSeenAt: z.number(),
  disabledAt: z.number().nullable().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const pushSubscriptionUpsertResponseSchema = z.object({
  ok: z.literal(true),
  subscriptionId: z.string(),
});

export const pushSubscriptionDeleteRequestSchema = z.object({
  endpoint: z.url(),
});

export const webPushPayloadSchema = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
  icon: z.url().optional(),
  badge: z.url().optional(),
  image: z.url().optional(),
  url: z.string().optional(),
  tag: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;
export type PushSubscriptionRecord = z.infer<typeof pushSubscriptionRecordSchema>;
export type WebPushPayload = z.infer<typeof webPushPayloadSchema>;
