import { NextResponse } from "next/server";
import {
  listNotifications,
  notificationsListQuerySchema,
} from "@/lib/data/notifications";
import {
  clearLiveNotificationSnapshot,
  getLiveNotificationSnapshots,
} from "@/lib/notifications/live-store";

const ACTIVE_STATUSES = new Set(["queued", "processing", "publishing", "rendering"]);
const LIVE_ACTIVE_TTL_MS = Math.max(
  60_000,
  Number.parseInt(process.env.NOTIFICATIONS_LIVE_ACTIVE_TTL_MS ?? "600000", 10) || 600_000
);

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
  const now = Date.now();
  Object.values(liveMap).forEach((live) => {
    const isStaleActive =
      ACTIVE_STATUSES.has(live.status) && now - live.updatedAt > LIVE_ACTIVE_TTL_MS;
    if (isStaleActive) {
      void clearLiveNotificationSnapshot(userId, live.key);
      return;
    }

    const existing = merged.get(live.key);
    const existingIsTerminal =
      existing != null &&
      !ACTIVE_STATUSES.has(existing.status) &&
      existing.updatedAt >= live.updatedAt;

    if (existingIsTerminal) {
      void clearLiveNotificationSnapshot(userId, live.key);
      return;
    }

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
      metadata: live.metadata ?? existing?.metadata ?? null,
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
