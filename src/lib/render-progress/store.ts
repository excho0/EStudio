import type { RenderProgress } from "@/types";
import { createScopedSnapshotStore } from "./snapshot-store";

const progressStore = createScopedSnapshotStore<RenderProgress>({
  keyPrefix: "render:progress",
  pool: "realtime",
  modeEnvKey: "RENDER_PROGRESS_STORE",
});

export const setRenderProgressSnapshot = async (
  payload: RenderProgress & { userId?: string | null }
) => {
  await progressStore.set(payload.userId, {
    id: payload.id,
    rendered: payload.rendered,
    total: payload.total,
    progress: payload.progress,
    eta: payload.eta,
  });
};

export const clearRenderProgressSnapshot = async ({
  userId,
  id,
}: {
  userId?: string | null;
  id: string;
}) => {
  await progressStore.remove(userId, id);
};

export const getRenderProgressSnapshot = async (userId?: string | null) => {
  return progressStore.getAll(userId);
};
