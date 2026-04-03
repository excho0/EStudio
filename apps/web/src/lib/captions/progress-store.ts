import type { CaptionProgress } from "@/lib/data/captions/progress";
import { createScopedSnapshotStore } from "@/lib/rendering/snapshot-store";

const progressStore = createScopedSnapshotStore<CaptionProgress>({
  keyPrefix: "caption:progress",
  pool: "realtime",
  modeEnvKey: "CAPTION_PROGRESS_STORE",
});

export const getCaptionProgressKey = (id: string, mode?: string) =>
  mode && mode.trim().length > 0 ? `${id}::${mode.trim()}` : id;

export const setCaptionProgressSnapshot = async (
  payload: CaptionProgress & { userId?: string | null }
) => {
  const key = payload.key ?? getCaptionProgressKey(payload.id, payload.mode);
  await progressStore.set(payload.userId, {
    key,
    id: payload.id,
    jobId: payload.jobId,
    mode: payload.mode,
    status: payload.status,
    progress: payload.progress,
    error: payload.error,
    metadata: payload.metadata,
    updatedAt: Date.now(),
  });
};

export const clearCaptionProgressSnapshot = async ({
  userId,
  id,
  mode,
  key,
}: {
  userId?: string | null;
  id: string;
  mode?: string;
  key?: string;
}) => {
  const resolvedKey = key ?? getCaptionProgressKey(id, mode);
  await Promise.all([
    progressStore.remove(userId, resolvedKey),
    ...(resolvedKey !== id ? [progressStore.remove(userId, id)] : []),
  ]);
};

export const getCaptionProgressSnapshot = async (userId?: string | null) => {
  return progressStore.getAll(userId);
};

export const clearCaptionProgressSnapshotsForContent = async ({
  userId,
  id,
}: {
  userId?: string | null;
  id: string;
}) => {
  const all = await progressStore.getAll(userId);
  const keys = Object.keys(all).filter((key) => {
    const entry = all[key];
    return entry?.id === id;
  });
  await Promise.all(keys.map((snapshotKey) => progressStore.remove(userId, snapshotKey)));
};
