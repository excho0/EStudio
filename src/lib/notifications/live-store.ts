import { createScopedSnapshotStore } from "@/lib/rendering/snapshot-store";
import type { NotificationKind, NotificationStatus } from "@/types";

export type LiveNotificationSnapshot = {
  id: string;
  key: string;
  contentId: string;
  mode?: string;
  kind: NotificationKind;
  status: NotificationStatus;
  progress?: number;
  stage?: string;
  error?: string;
  updatedAt: number;
};

const liveStore = createScopedSnapshotStore<LiveNotificationSnapshot>({
  keyPrefix: "notifications:live",
  pool: "realtime",
  modeEnvKey: "NOTIFICATIONS_LIVE_STORE",
});

export const setLiveNotificationSnapshot = async (
  userId: string | null | undefined,
  payload: Omit<LiveNotificationSnapshot, "id" | "updatedAt"> & { updatedAt?: number }
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
