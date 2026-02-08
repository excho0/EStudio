import { Queue } from "bullmq";
import IORedis from "ioredis";

export const RENDER_QUEUE_NAME = "content-render";

export type RenderQueueJobPayload = {
  id: string;
  userId: string;
};

const resolveRedisUrl = () =>
  process.env.RENDER_QUEUE_REDIS_URL?.trim() || process.env.REDIS_URL?.trim() || "";

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
  const jobId = `${payload.userId}:${payload.id}`;
  const existing = await queue.getJob(jobId);
  if (existing) {
    return existing;
  }
  return queue.add("render", payload, { jobId });
};
