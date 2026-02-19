import { z } from "zod";

export const notificationKindSchema = z.enum(["render", "publish", "caption"]);

export const notificationStatusSchema = z.enum([
  "queued",
  "processing",
  "publishing",
  "rendering",
  "completed",
  "failed",
]);

export const notificationItemSchema = z.object({
  id: z.string(),
  key: z.string(),
  userId: z.string(),
  contentId: z.string(),
  mode: z.string().optional(),
  kind: notificationKindSchema,
  status: notificationStatusSchema,
  progress: z.number().optional(),
  stage: z.string().optional(),
  error: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  readAt: z.number().nullable().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const notificationsListResponseSchema = z.object({
  items: z.array(notificationItemSchema),
});

export const notificationsListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  unreadOnly: z.coerce.boolean().optional().default(false),
});

export const notificationsMarkReadRequestSchema = z.object({
  ids: z.array(z.string()).optional(),
});

export const notificationsMarkReadResponseSchema = z.object({
  ok: z.literal(true),
  updated: z.number().int().nonnegative(),
});

export type NotificationsListQuery = z.infer<typeof notificationsListQuerySchema>;
export type NotificationsMarkReadRequest = z.infer<typeof notificationsMarkReadRequestSchema>;
