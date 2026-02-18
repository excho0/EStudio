import { Queue } from "bullmq";
import IORedis from "ioredis";
import type { RenderBackend } from "@/lib/rendering/backend";
import { resolveRedisPoolUrl } from "@/lib/redis/pools";

export const RENDER_QUEUE_NAME = "content-render";

export type RenderQueueJobPayload = {
  id: string;
  userId: string;
  backend: RenderBackend;
  mode?: string;
};

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
    throw new Error("Render queue is not configured");
  }
  const jobId = `${payload.userId}:${payload.id}:${payload.mode ?? "__default__"}`;
  const existing = await queue.getJob(jobId);
  if (existing) {
    return existing;
  }
  return queue.add("render", payload, { jobId });
};

export const cancelRenderJob = async (userId: string, id: string) => {
  const queue = getRenderQueue();
  if (!queue) {
    return { ok: false as const, reason: "queue_unavailable" as const };
  }
  const prefix = `${userId}:${id}:`;
  const jobs = await queue.getJobs(
    ["wait", "delayed", "prioritized", "paused", "active"],
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
