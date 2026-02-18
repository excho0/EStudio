import type { RenderProgress } from "@/types";
import { createScopedSnapshotStore } from "./snapshot-store";

const progressStore = createScopedSnapshotStore<RenderProgress>({
  keyPrefix: "render:progress",
  pool: "realtime",
  modeEnvKey: "RENDER_PROGRESS_STORE",
});

export const getRenderProgressKey = (id: string, mode?: string) =>
  mode && mode.trim().length > 0 ? `${id}::${mode.trim()}` : id;

export const setRenderProgressSnapshot = async (
  payload: RenderProgress & { userId?: string | null }
) => {
  const key = payload.key ?? getRenderProgressKey(payload.id, payload.mode);
  await progressStore.set(payload.userId, {
    key,
    id: payload.id,
    mode: payload.mode,
    rendered: payload.rendered,
    total: payload.total,
    progress: payload.progress,
    eta: payload.eta,
    updatedAt: Date.now(),
  });
};

export const clearRenderProgressSnapshot = async ({
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
  await progressStore.remove(userId, key ?? getRenderProgressKey(id, mode));
};

export const getRenderProgressSnapshot = async (userId?: string | null) => {
  return progressStore.getAll(userId);
};

export const clearRenderProgressSnapshotsForContent = async ({
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
  await Promise.all(keys.map((key) => progressStore.remove(userId, key)));
};
