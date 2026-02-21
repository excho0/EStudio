import { NextResponse } from "next/server";
import {
  listNotifications,
  notificationsListQuerySchema,
} from "@/lib/data/notifications";
import { getLiveNotificationSnapshots } from "@/lib/notifications/live-store";

export const handleListNotifications = async (
  userId: string,
  query: Record<string, string | string[] | undefined>
) => {
  const parsed = notificationsListQuerySchema.parse({
    limit: query.limit,
    unreadOnly: query.unreadOnly,
  });
  const [persisted, liveMap] = await Promise.all([
    listNotifications(userId, parsed),
    getLiveNotificationSnapshots(userId),
  ]);
  const merged = new Map(persisted.items.map((item) => [item.key, item]));
  Object.values(liveMap).forEach((live) => {
    const existing = merged.get(live.key);
    merged.set(live.key, {
      id: existing?.id ?? `live:${live.key}`,
      key: live.key,
      userId,
      contentId: live.contentId,
      mode: live.mode,
      kind: live.kind,
      status: live.status,
      progress: live.progress,
      stage: live.stage,
      error: live.error,
      metadata: existing?.metadata ?? null,
      readAt: existing?.readAt ?? null,
      createdAt: existing?.createdAt ?? live.updatedAt,
      updatedAt: Math.max(existing?.updatedAt ?? 0, live.updatedAt),
    });
  });
  const items = Array.from(merged.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, parsed.limit);
  return NextResponse.json({ items });
};
