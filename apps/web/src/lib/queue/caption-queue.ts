import { Queue } from "bullmq";
import IORedis from "ioredis";
import { resolveRedisPoolUrl } from "@/lib/redis/pools";
import { getLogger } from "@/lib/logging";

export const CAPTION_QUEUE_NAME = "content-caption";

export type CaptionQueueJobPayload = {
  id: string;
  userId: string;
  jobId: string;
  mode: string;
  language?: string;
  backend?: string;
};

const captionQueueLogger = getLogger("caption-queue");

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
    captionQueueLogger.warn(
      {
        userId: payload.userId,
        contentId: payload.id,
        jobId: payload.jobId,
        mode: payload.mode,
      },
      "Caption queue unavailable."
    );
    throw new Error("Caption queue is not configured");
  }
  captionQueueLogger.debug(
    {
      userId: payload.userId,
      contentId: payload.id,
      jobId: payload.jobId,
      mode: payload.mode,
      backend: payload.backend,
      language: payload.language,
    },
    "Enqueuing caption queue job."
  );
  return queue.add("caption", payload, { jobId: payload.jobId });
};
