import { Queue } from "bullmq";
import IORedis from "ioredis";
import { resolveRedisPoolUrl } from "@/lib/redis/pools";

export const CAPTION_QUEUE_NAME = "content-caption";

export type CaptionQueueJobPayload = {
  id: string;
  userId: string;
  mode: string;
  language?: string;
  backend?: string;
};

const resolveRedisUrl = () =>
  resolveRedisPoolUrl("caption-queue") || resolveRedisPoolUrl("render-queue");

let queueInstance: Queue<CaptionQueueJobPayload> | null = null;

export const getCaptionQueue = () => {
  if (queueInstance) return queueInstance;
  const redisUrl = resolveRedisUrl();
  if (!redisUrl) return null;

  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  queueInstance = new Queue<CaptionQueueJobPayload>(CAPTION_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 4000 },
      removeOnComplete: 500,
      removeOnFail: 500,
    },
  });
  return queueInstance;
};

export const isCaptionQueueEnabled = () => {
  if (process.env.CAPTION_QUEUE_ENABLED?.trim().toLowerCase() === "false") {
    return false;
  }
  return resolveRedisUrl().length > 0;
};

export const enqueueCaptionJob = async (payload: CaptionQueueJobPayload) => {
  const queue = getCaptionQueue();
  if (!queue) {
    throw new Error("Caption queue is not configured");
  }
  const jobId = `${payload.userId}:${payload.id}:${payload.mode}`;
  const existing = await queue.getJob(jobId);
  if (existing) return existing;
  return queue.add("caption", payload, { jobId });
};

