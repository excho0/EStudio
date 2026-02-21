import { z } from "zod";
import {
  notificationItemSchema,
  notificationKindSchema,
  notificationsListResponseSchema,
  notificationStatusSchema,
} from "@/lib/data/notifications/schemas";

export type NotificationKind = z.infer<typeof notificationKindSchema>;
export type NotificationStatus = z.infer<typeof notificationStatusSchema>;
export type NotificationItem = z.infer<typeof notificationItemSchema>;
export type NotificationListResponse = z.infer<typeof notificationsListResponseSchema>;
