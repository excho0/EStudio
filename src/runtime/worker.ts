import "dotenv/config";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import {
  executeRenderForContentWithBackend,
  resolveRenderBackend,
} from "@/lib/rendering/backend";
import { processPublishJob } from "@/lib/publishing/publish-queue";
import { readPublishRow, updatePublish } from "@/lib/publishing/publish-job-runner";
import { emitPublishUpdate } from "@/lib/socket/manager";
import { getLogger } from "@/lib/logging";
import { resolveRedisPoolUrl } from "@/lib/redis/pools";
import { processCaptionJob } from "@/lib/captions/process-caption-job";

const redisUrl =
  resolveRedisPoolUrl("render-queue") ||
  resolveRedisPoolUrl("publish-queue") ||
  resolveRedisPoolUrl("caption-queue") ||
  resolveRedisPoolUrl("default");
const concurrency = Math.max(1, Number(process.env.RENDER_WORKER_CONCURRENCY || "1"));
const publishConcurrency = Math.max(
  1,
  Number(process.env.PUBLISH_WORKER_CONCURRENCY || "2")
);
const captionConcurrency = Math.max(
  1,
  Number(process.env.CAPTION_WORKER_CONCURRENCY || "1")
);
const logger = getLogger("runtime-worker");

if (!redisUrl) {
  logger.error("Missing REDIS_URL/RENDER_QUEUE_REDIS_URL/PUBLISH_QUEUE_REDIS_URL.");
  process.exit(1);
}

const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

const renderWorker = new Worker(
  "content-render",
  async (job) => {
    const { id, userId, backend: requestedBackend, mode, jobId } = job.data ?? {};
    if (!id || !userId || !jobId) {
      throw new Error("Invalid render payload");
    }
    const backend = resolveRenderBackend(
      typeof requestedBackend === "string" ? requestedBackend : undefined
    );
    await executeRenderForContentWithBackend({ userId, id, backend, mode, jobId });
  },
  {
    connection,
    concurrency,
  }
);

const publishWorker = new Worker(
  "content-publish",
  async (job) => {
    const { publishId } = job.data ?? {};
    if (!publishId) {
      throw new Error("Invalid publish payload");
    }
    await processPublishJob(publishId, {
      attempt: (job.attemptsMade ?? 0) + 1,
      maxAttempts: job.opts.attempts,
    });
  },
  {
    connection,
    concurrency: publishConcurrency,
  }
);

const captionWorker = new Worker(
  "content-caption",
  async (job) => {
    const { id, userId, mode, backend, language, jobId } = job.data ?? {};
    if (!id || !userId || !mode || !jobId) {
      throw new Error("Invalid caption payload");
    }
    await processCaptionJob({ id, userId, mode, backend, language, jobId });
  },
  {
    connection,
    concurrency: captionConcurrency,
  }
);

renderWorker.on("ready", () => {
  logger.info({ queue: "content-render", concurrency }, "Worker ready.");
});

publishWorker.on("ready", () => {
  logger.info(
    { queue: "content-publish", concurrency: publishConcurrency },
    "Worker ready."
  );
});

captionWorker.on("ready", () => {
  logger.info(
    { queue: "content-caption", concurrency: captionConcurrency },
    "Worker ready."
  );
});

renderWorker.on("completed", (job) => {
  logger.info({ queue: "content-render", jobId: job.id }, "Job completed.");
});

publishWorker.on("completed", (job) => {
  logger.info({ queue: "content-publish", jobId: job.id }, "Job completed.");
});

captionWorker.on("completed", (job) => {
  logger.info({ queue: "content-caption", jobId: job.id }, "Job completed.");
});

renderWorker.on("failed", (job, error) => {
  logger.error(
    {
      queue: "content-render",
      jobId: job?.id ?? "unknown",
      error: error.message,
    },
    "Job failed."
  );
});

publishWorker.on("failed", (job, error) => {
  logger.error(
    {
      queue: "content-publish",
      jobId: job?.id ?? "unknown",
      error: error.message,
    },
    "Job failed."
  );
  if (!job?.data?.publishId) {
    return;
  }
  const publishId = String(job.data.publishId);
  const maxAttempts =
    typeof job.opts.attempts === "number" ? Math.max(1, job.opts.attempts) : 1;
  const attemptsMade = Math.max(1, job.attemptsMade ?? 1);
  void (async () => {
    const publish = await readPublishRow(publishId);
    if (!publish) {
      return;
    }
    if (attemptsMade < maxAttempts) {
      const retryMessage = `Retrying upload (${attemptsMade + 1}/${maxAttempts})`;
      await updatePublish(publishId, { status: "queued", error: retryMessage });
      emitPublishUpdate({
        userId: publish.userId,
        id: publishId,
        jobId: publishId,
        status: "queued",
        error: retryMessage,
      });
      return;
    }

    const finalMessage = `Final failure after ${attemptsMade}/${maxAttempts} attempts: ${error.message}`;
    await updatePublish(publishId, { status: "failed", error: finalMessage });
    emitPublishUpdate({
      userId: publish.userId,
      id: publishId,
      jobId: publishId,
      status: "failed",
      error: finalMessage,
    });
  })().catch((cause) => {
    logger.error(
      {
        queue: "content-publish",
        jobId: publishId,
        error: cause instanceof Error ? cause.message : String(cause),
      },
      "Failed to persist publish retry/failure state."
    );
  });
});

captionWorker.on("failed", (job, error) => {
  logger.error(
    {
      queue: "content-caption",
      jobId: job?.id ?? "unknown",
      error: error.message,
    },
    "Job failed."
  );
});

const shutdown = async (signal: string) => {
  logger.info({ signal }, "Worker shutdown signal received.");
  await Promise.all([renderWorker.close(), publishWorker.close(), captionWorker.close()]);
  await connection.quit();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
