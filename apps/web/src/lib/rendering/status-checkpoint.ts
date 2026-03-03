import { hasAnyRenderedOutput } from "@/lib/content/store";
import { createScopedSnapshotStore } from "@/lib/rendering/snapshot-store";
import type { ContentStatus } from "@/lib/data/content";

export type ContentRenderStatus = ContentStatus;

type StatusCheckpoint = {
  id: string;
  status: ContentRenderStatus;
  updatedAt: number;
};

const checkpointStore = createScopedSnapshotStore<StatusCheckpoint>({
  keyPrefix: "render:status-checkpoint",
  pool: "realtime",
  modeEnvKey: "RENDER_STATUS_CHECKPOINT_STORE",
});

export const setRenderStatusCheckpoint = async (
  userId: string | null | undefined,
  contentId: string,
  status: ContentRenderStatus
) => {
  await checkpointStore.set(userId, {
    id: contentId,
    status,
    updatedAt: Date.now(),
  });
};

export const getRenderStatusCheckpoint = async (
  userId: string | null | undefined,
  contentId: string
) => {
  const all = await checkpointStore.getAll(userId);
  return all[contentId] ?? null;
};

export const clearRenderStatusCheckpoint = async (
  userId: string | null | undefined,
  contentId: string
) => {
  await checkpointStore.remove(userId, contentId);
};

export const resolveRollbackContentStatus = async (
  userId: string,
  contentId: string
): Promise<Exclude<ContentRenderStatus, "rendering">> => {
  if (await hasAnyRenderedOutput(userId, contentId)) {
    return "rendered";
  }
  const checkpoint = await getRenderStatusCheckpoint(userId, contentId);
  if (checkpoint && checkpoint.status !== "rendering") {
    return checkpoint.status;
  }
  return "uploaded";
};
