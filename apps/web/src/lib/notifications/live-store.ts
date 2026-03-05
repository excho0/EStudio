import { createScopedSnapshotStore } from "@/lib/rendering/snapshot-store";
import { z } from "zod";
import { notificationItemSchema } from "@/lib/data/notifications/schemas";

export const liveNotificationSnapshotSchema = notificationItemSchema.pick({
  id: true,
  key: true,
  contentId: true,
  mode: true,
  kind: true,
  status: true,
  progress: true,
  stage: true,
  error: true,
  metadata: true,
  updatedAt: true,
});

export type LiveNotificationSnapshot = z.infer<typeof liveNotificationSnapshotSchema>;
const liveNotificationSnapshotInputSchema = liveNotificationSnapshotSchema
  .omit({ id: true, updatedAt: true })
  .extend({ updatedAt: z.number().optional() });

export type LiveNotificationSnapshotInput = z.infer<
  typeof liveNotificationSnapshotInputSchema
>;

const liveStore = createScopedSnapshotStore<LiveNotificationSnapshot>({
  keyPrefix: "notifications:live",
  pool: "realtime",
  modeEnvKey: "NOTIFICATIONS_LIVE_STORE",
});

export const setLiveNotificationSnapshot = async (
  userId: string | null | undefined,
  payload: LiveNotificationSnapshotInput
) => {
  await liveStore.set(userId, {
    id: payload.key,
    key: payload.key,
    contentId: payload.contentId,
    mode: payload.mode,
    kind: payload.kind,
    status: payload.status,
    progress: payload.progress,
    stage: payload.stage,
    error: payload.error,
    metadata: payload.metadata,
    updatedAt: payload.updatedAt ?? Date.now(),
  });
};

export const clearLiveNotificationSnapshot = async (
  userId: string | null | undefined,
  key: string
) => {
  await liveStore.remove(userId, key);
};

export const getLiveNotificationSnapshots = async (userId?: string | null) => {
  return liveStore.getAll(userId);
};

export const finalizeActiveLiveRenderNotificationsForContent = async (
  userId: string | null | undefined,
  contentId: string
) => {
  const snapshots = await liveStore.getAll(userId);
  const entries = Object.entries(snapshots);
  await Promise.all(
    entries.map(async ([key, snapshot]) => {
      const isActiveRender =
        snapshot.kind === "render" &&
        snapshot.contentId === contentId &&
        (snapshot.status === "queued" ||
          snapshot.status === "processing" ||
          snapshot.status === "rendering");
      if (!isActiveRender) return;
      await liveStore.remove(userId, key);
    })
  );
};
