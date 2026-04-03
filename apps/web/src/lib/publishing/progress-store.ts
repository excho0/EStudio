import type { PublishProgressSnapshot } from "@/lib/data/publish/progress";
import { createScopedSnapshotStore } from "@/lib/rendering/snapshot-store";

const progressStore = createScopedSnapshotStore<PublishProgressSnapshot>({
  keyPrefix: "publish:progress",
  pool: "realtime",
  modeEnvKey: "PUBLISH_PROGRESS_STORE",
});

export const getPublishProgressKey = (jobId: string) => `publish:${jobId}`;

export const setPublishProgressSnapshot = async (
  payload: PublishProgressSnapshot & { userId?: string | null }
) => {
  const key = payload.key ?? getPublishProgressKey(payload.jobId);
  await progressStore.set(payload.userId, {
    key,
    id: payload.id,
    jobId: payload.jobId,
    status: payload.status,
    progress: payload.progress,
    stage: payload.stage,
    error: payload.error,
    metadata: payload.metadata,
    updatedAt: Date.now(),
  });
};

export const clearPublishProgressSnapshot = async ({
  userId,
  id,
  jobId,
  key,
}: {
  userId?: string | null;
  id?: string;
  jobId: string;
  key?: string;
}) => {
  const resolvedKey = key ?? getPublishProgressKey(jobId);
  await Promise.all([
    progressStore.remove(userId, resolvedKey),
    ...(id && id !== resolvedKey ? [progressStore.remove(userId, id)] : []),
  ]);
};

export const getPublishProgressSnapshot = async (userId?: string | null) => {
  return progressStore.getAll(userId);
};
