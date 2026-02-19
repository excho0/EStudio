import { z } from "zod";
import { ApiClient } from "@/lib/sdk/client";
import {
  notificationsListResponseSchema,
  notificationsMarkReadResponseSchema,
} from "@/lib/data/notifications/schemas";

const client = new ApiClient();

export type NotificationsListResponse = z.infer<typeof notificationsListResponseSchema>;
export type NotificationsMarkReadResponse = z.infer<
  typeof notificationsMarkReadResponseSchema
>;

export const notificationsSdk = {
  list(query?: { limit?: number; unreadOnly?: boolean }): Promise<NotificationsListResponse> {
    const searchParams = new URLSearchParams();
    if (typeof query?.limit === "number") {
      searchParams.set("limit", String(query.limit));
    }
    if (typeof query?.unreadOnly === "boolean") {
      searchParams.set("unreadOnly", String(query.unreadOnly));
    }
    const suffix = searchParams.toString();
    return client.get(
      `/api/notifications${suffix ? `?${suffix}` : ""}`,
      "Failed to load notifications.",
      notificationsListResponseSchema
    );
  },
  markRead(ids?: string[]): Promise<NotificationsMarkReadResponse> {
    return client.patchJson(
      "/api/notifications/read",
      ids && ids.length ? { ids } : {},
      "Failed to mark notifications as read.",
      notificationsMarkReadResponseSchema
    );
  },
};
