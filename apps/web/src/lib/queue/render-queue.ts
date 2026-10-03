import { Queue } from "bullmq";
import IORedis from "ioredis";
import type { RenderBackend } from "@/lib/rendering/backend";
import { resolveRedisPoolUrl } from "@/lib/redis/pools";
import { getLogger } from "@/lib/logging";

export const RENDER_QUEUE_NAME = "content-render";

export type RenderQueueJobPayload = {
  id: string;
  userId: string;
  jobId: string;
  backend: RenderBackend;
  mode?: string;
};

const renderQueueLogger = getLogger("render-queue");

const resolveRedisUrl = () => resolveRedisPoolUrl("render-queue");

let queueInstance: Queue<RenderQueueJobPayload> | null = null;

export const getRenderQueue = () => {
  if (queueInstance) return queueInstance;
  const redisUrl = resolveRedisUrl();
  if (!redisUrl) return null;

  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  queueInstance = new Queue<RenderQueueJobPayload>(RENDER_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    },
  });

  return queueInstance;
};

export const isRenderQueueEnabled = () => {
  if (process.env.RENDER_QUEUE_ENABLED?.trim().toLowerCase() === "false") {
    return false;
  }
  return resolveRedisUrl().length > 0;
};

export const enqueueRenderJob = async (payload: RenderQueueJobPayload) => {
  const queue = getRenderQueue();
  if (!queue) {
    renderQueueLogger.warn(
      { userId: payload.userId, contentId: payload.id, jobId: payload.jobId },
      "Render queue unavailable."
    );
    throw new Error("Render queue is not configured");
  }
  renderQueueLogger.debug(
    {
      userId: payload.userId,
      contentId: payload.id,
      jobId: payload.jobId,
      backend: payload.backend,
      mode: payload.mode,
    },
    "Enqueuing render queue job."
  );
  return queue.add("render", payload, { jobId: payload.jobId });
};

export const cancelRenderJob = async (userId: string, id: string) => {
  const queue = getRenderQueue();
  if (!queue) {
    return { ok: false as const, reason: "queue_unavailable" as const };
  }
  const prefix = `${userId}:${id}:`;
  const jobs = await queue.getJobs(
    ["wait", "paused", "delayed", "prioritized", "active"] as const as Parameters<
      typeof queue.getJobs
    >[0],
    0,
    -1,
    false
  );
  const candidates = jobs.filter((job) => {
    if (!job?.id) return false;
    const jobId = String(job.id);
    return jobId === `${userId}:${id}` || jobId.startsWith(prefix);
  });
  if (candidates.length === 0) {
    return { ok: false as const, reason: "not_found" as const };
  }

  for (const job of candidates) {
    const state = await job.getState();
    if (state === "active") {
      return { ok: false as const, reason: "active" as const };
    }
    if (state === "completed" || state === "failed" || state === "unknown") {
      continue;
    }
    await job.remove();
  }

  return { ok: true as const };
};
