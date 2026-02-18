import { Queue } from "bullmq";
import IORedis from "ioredis";
import { resolveRedisPoolUrl } from "@/lib/redis/pools";

export const PUBLISH_QUEUE_NAME = "content-publish";

export type PublishQueueJobPayload = {
  publishId: string;
};

const resolveRedisUrl = () => resolveRedisPoolUrl("publish-queue");

let queueInstance: Queue<PublishQueueJobPayload> | null = null;

export const getPublishQueue = () => {
  if (queueInstance) return queueInstance;
  const redisUrl = resolveRedisUrl();
  if (!redisUrl) return null;

  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  queueInstance = new Queue<PublishQueueJobPayload>(PUBLISH_QUEUE_NAME, {
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

export const isPublishQueueEnabled = () => {
  if (process.env.PUBLISH_QUEUE_ENABLED?.trim().toLowerCase() === "false") {
    return false;
  }
  return resolveRedisUrl().length > 0;
};

export const enqueuePublishQueueJob = async (payload: PublishQueueJobPayload) => {
  const queue = getPublishQueue();
  if (!queue) {
    throw new Error("Publish queue is not configured");
  }
  const jobId = payload.publishId;
  const existing = await queue.getJob(jobId);
  if (existing) {
    return existing;
  }
  return queue.add("publish", payload, { jobId });
};
