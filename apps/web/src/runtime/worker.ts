import "dotenv/config";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import {
  executeRenderForContentWithBackend,
  resolveRenderBackend,
  type RenderBackend,
} from "@/lib/rendering/backend";
import { processPublishJob } from "@/lib/publishing/publish-queue";
import { readPublishRow, updatePublish } from "@/lib/publishing/publish-job-runner";
import { getLogger } from "@/lib/logging";
import { resolveRedisPoolUrl } from "@/lib/redis/pools";
import { processCaptionJob } from "@/lib/captions/process-caption-job";
import { getRenderQueue, enqueueRenderJob } from "@/lib/queue/render-queue";
import { getCaptionQueue, enqueueCaptionJob } from "@/lib/queue/caption-queue";
import { getPublishQueue, enqueuePublishQueueJob } from "@/lib/queue/publish-queue";
import {
  emitCaptionUpdate,
  emitPublishUpdate,
  emitRenderQueued,
} from "@/lib/socket/manager";
import {
  listActiveJobActivities,
  updateJobActivityStateById,
} from "@/lib/data/notifications";
import type { NotificationItem } from "@/types";

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

const LEASE_TTL_MS = Math.max(
  10_000,
  Number(process.env.JOB_LEASE_TTL_MS ?? "30000")
);
const LEASE_HEARTBEAT_MS = Math.max(
  2_000,
  Number(process.env.JOB_LEASE_HEARTBEAT_MS ?? "10000")
);
const LOST_JOB_GRACE_MS = Math.max(
  2_000,
  Number(process.env.LOST_JOB_GRACE_MS ?? "10000")
);
const RECOVER_LOCK_MS = Math.max(
  5_000,
  Number(process.env.RECOVERY_LOCK_TTL_MS ?? "60000")
);

const logger = getLogger("runtime-worker");

type JobKind = "render" | "publish" | "caption";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const leaseKey = (kind: JobKind, jobId: string) => `job-lease:${kind}:${jobId}`;
const recoverLockKey = (kind: JobKind, jobId: string) =>
  `job-recovery-lock:${kind}:${jobId}`;

const extractJobIdFromNotificationKey = (kind: JobKind, key: string) => {
  const prefix = `${kind}:`;
  if (!key.startsWith(prefix)) return null;
  const value = key.slice(prefix.length).trim();
  return value.length > 0 ? value : null;
};

const mapQueueStateToNotificationStatus = (
  kind: JobKind,
  queueState: string
): NotificationItem["status"] | null => {
  if (
    queueState === "wait" ||
    queueState === "waiting" ||
    queueState === "waiting-children" ||
    queueState === "delayed" ||
    queueState === "prioritized" ||
    queueState === "paused"
  ) {
    return "queued";
  }
  if (queueState === "active") {
    if (kind === "render") return "rendering";
    if (kind === "publish") return "publishing";
    return "processing";
  }
  if (queueState === "completed") {
    return "completed";
  }
  if (queueState === "failed") {
    return "failed";
  }
  return null;
};

if (!redisUrl) {
  logger.error("Missing REDIS_URL/RENDER_QUEUE_REDIS_URL/PUBLISH_QUEUE_REDIS_URL.");
  process.exit(1);
}

const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

const withJobLease = async <T>(kind: JobKind, jobId: string, run: () => Promise<T>) => {
  const key = leaseKey(kind, jobId);
  const heartbeat = async () => {
    await connection.set(key, "1", "PX", LEASE_TTL_MS);
  };
  await heartbeat();
  const interval = setInterval(() => {
    void heartbeat().catch((error) => {
      logger.warn(
        {
          kind,
          jobId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Job lease heartbeat failed."
      );
    });
  }, LEASE_HEARTBEAT_MS);

  try {
    return await run();
  } finally {
    clearInterval(interval);
    await connection.del(key).catch(() => 0);
  }
};

const acquireRecoveryLock = async (kind: JobKind, jobId: string) => {
  const result = await connection.set(
    recoverLockKey(kind, jobId),
    "1",
    "PX",
    RECOVER_LOCK_MS,
    "NX"
  );
  return result === "OK";
};

const recoverActiveJobActivitiesOnStartup = async () => {
  const active = await listActiveJobActivities(2000);
  if (active.length === 0) {
    logger.info({ scanned: 0 }, "Active job recovery reconciliation completed.");
    return;
  }

  const renderQueue = getRenderQueue();
  const captionQueue = getCaptionQueue();
  const publishQueue = getPublishQueue();

  let scanned = 0;
  let stateAligned = 0;
  let requeued = 0;
  let canceled = 0;
  let missingJobId = 0;
  let lockSkipped = 0;

  for (const item of active) {
    scanned += 1;
    const kind = item.kind as JobKind;
    const jobId = extractJobIdFromNotificationKey(kind, item.key);

    const markState = async (
      status: NotificationItem["status"],
      stage: string,
      options?: { progress?: number; error?: string | null }
    ) => {
      await updateJobActivityStateById(item.id, {
        status,
        progress: options?.progress,
        stage,
        error: options?.error ?? null,
      });
      stateAligned += 1;
    };

    const markCanceled = async (stage: string) => {
      await updateJobActivityStateById(item.id, {
        status: "canceled",
        progress: 1,
        stage,
        error: null,
      });
      canceled += 1;
    };

    if (!jobId) {
      missingJobId += 1;
      await markCanceled("Recovered: missing job id");
      continue;
    }

    const queue =
      kind === "render" ? renderQueue : kind === "caption" ? captionQueue : publishQueue;

    if (!queue) {
      await markCanceled(`Recovered: ${kind} queue unavailable`);
      continue;
    }

    const checkState = async () => {
      const job = await queue.getJob(jobId);
      if (!job) {
        return { exists: false as const, state: "missing" };
      }
      const state = await job.getState();
      return { exists: true as const, state };
    };

    let probe = await checkState();

    if (probe.exists) {
      const mapped = mapQueueStateToNotificationStatus(kind, probe.state);
      if (mapped && mapped !== item.status) {
        await markState(mapped, `Recovered: queue state ${probe.state}`);
      }
      continue;
    }

    // Race-safe grace window: a job can transition around startup.
    const hasLease = await connection.exists(leaseKey(kind, jobId));
    if (hasLease) {
      continue;
    }

    await sleep(LOST_JOB_GRACE_MS);
    probe = await checkState();
    if (probe.exists) {
      const mapped = mapQueueStateToNotificationStatus(kind, probe.state);
      if (mapped && mapped !== item.status) {
        await markState(mapped, `Recovered: queue state ${probe.state}`);
      }
      continue;
    }

    const lockAcquired = await acquireRecoveryLock(kind, jobId);
    if (!lockAcquired) {
      lockSkipped += 1;
      continue;
    }

    try {
      if (kind === "render") {
        const backend: RenderBackend = resolveRenderBackend();
        await enqueueRenderJob({
          id: item.contentId,
          userId: item.userId,
          jobId,
          backend,
          mode: item.mode,
        });
        await updateJobActivityStateById(item.id, {
          status: "queued",
          progress: 0,
          stage: "Recovered: requeued",
          error: null,
        });
        emitRenderQueued({
          userId: item.userId,
          id: item.contentId,
          jobId,
          mode: item.mode,
          backend,
        });
        requeued += 1;
        continue;
      }

      if (kind === "caption") {
        if (!item.mode) {
          await markCanceled("Recovered: caption mode missing");
          continue;
        }
        await enqueueCaptionJob({
          id: item.contentId,
          userId: item.userId,
          jobId,
          mode: item.mode,
        });
        await updateJobActivityStateById(item.id, {
          status: "queued",
          progress: 0,
          stage: "Recovered: requeued",
          error: null,
        });
        emitCaptionUpdate({
          userId: item.userId,
          id: item.contentId,
          jobId,
          mode: item.mode,
          status: "queued",
          progress: 0,
        });
        requeued += 1;
        continue;
      }

      // publish
      await enqueuePublishQueueJob({ publishId: jobId });
      await updateJobActivityStateById(item.id, {
        status: "queued",
        progress: 0,
        stage: "Recovered: requeued",
        error: null,
      });
      emitPublishUpdate({
        userId: item.userId,
        id: item.contentId,
        jobId,
        status: "queued",
      });
      requeued += 1;
    } catch (error) {
      logger.error(
        {
          jobActivityId: item.id,
          key: item.key,
          kind,
          jobId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to recover lost job."
      );
      await markCanceled("Recovered: requeue failed");
    }
  }

  logger.info(
    { scanned, stateAligned, requeued, canceled, missingJobId, lockSkipped },
    "Active job recovery reconciliation completed."
  );
};

const renderWorker = new Worker(
  "content-render",
  async (job) =>
    withJobLease("render", String(job.id), async () => {
      const { id, userId, backend: requestedBackend, mode, jobId } = job.data ?? {};
      if (!id || !userId || !jobId) {
        throw new Error("Invalid render payload");
      }
      const backend = resolveRenderBackend(
        typeof requestedBackend === "string" ? requestedBackend : undefined
      );
      await executeRenderForContentWithBackend({ userId, id, backend, mode, jobId });
    }),
  {
    connection,
    concurrency,
  }
);

const publishWorker = new Worker(
  "content-publish",
  async (job) =>
    withJobLease("publish", String(job.id), async () => {
      const { publishId } = job.data ?? {};
      if (!publishId) {
        throw new Error("Invalid publish payload");
      }
      await processPublishJob(publishId, {
        attempt: (job.attemptsMade ?? 0) + 1,
        maxAttempts: job.opts.attempts,
      });
    }),
  {
    connection,
    concurrency: publishConcurrency,
  }
);

const captionWorker = new Worker(
  "content-caption",
  async (job) =>
    withJobLease("caption", String(job.id), async () => {
      const { id, userId, mode, backend, language, jobId } = job.data ?? {};
      if (!id || !userId || !mode || !jobId) {
        throw new Error("Invalid caption payload");
      }
      await processCaptionJob({ id, userId, mode, backend, language, jobId });
    }),
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
  logger.debug(
    {
      queue: "content-render",
      jobId: job.id,
      userId: job.data?.userId,
      contentId: job.data?.id,
    },
    "Job completed."
  );
});

publishWorker.on("completed", (job) => {
  const publishId =
    typeof job.data?.publishId === "string" ? job.data.publishId : undefined;
  if (!publishId) {
    logger.debug({ queue: "content-publish", jobId: job.id }, "Job completed.");
    return;
  }
  void (async () => {
    const publish = await readPublishRow(publishId);
    logger.debug(
      {
        queue: "content-publish",
        jobId: job.id,
        publishId,
        userId: publish?.userId,
        contentId: publish?.contentId,
      },
      "Job completed."
    );
  })().catch(() => {
    logger.debug({ queue: "content-publish", jobId: job.id, publishId }, "Job completed.");
  });
});

publishWorker.on("active", (job) => {
  const publishId =
    typeof job.data?.publishId === "string" ? job.data.publishId : undefined;
  if (!publishId) {
    logger.debug(
      {
        queue: "content-publish",
        jobId: job.id,
        attemptsMade: job.attemptsMade,
      },
      "Job started."
    );
    return;
  }
  void (async () => {
    const publish = await readPublishRow(publishId);
    logger.debug(
      {
        queue: "content-publish",
        jobId: job.id,
        publishId,
        userId: publish?.userId,
        contentId: publish?.contentId,
        attemptsMade: job.attemptsMade,
      },
      "Job started."
    );
  })().catch(() => {
    logger.debug(
      {
        queue: "content-publish",
        jobId: job.id,
        publishId,
        attemptsMade: job.attemptsMade,
      },
      "Job started."
    );
  });
});

captionWorker.on("completed", (job) => {
  logger.debug(
    {
      queue: "content-caption",
      jobId: job.id,
      userId: job.data?.userId,
      contentId: job.data?.id,
    },
    "Job completed."
  );
});

renderWorker.on("failed", (job, error) => {
  logger.error(
    {
      queue: "content-render",
      jobId: job?.id ?? "unknown",
      userId: job?.data?.userId,
      contentId: job?.data?.id,
      error: error.message,
    },
    "Job failed."
  );
});

publishWorker.on("failed", (job, error) => {
  const publishIdFromPayload =
    typeof job?.data?.publishId === "string" ? String(job.data.publishId) : undefined;
  if (publishIdFromPayload) {
    void (async () => {
      const publish = await readPublishRow(publishIdFromPayload);
      logger.error(
        {
          queue: "content-publish",
          jobId: job?.id ?? "unknown",
          publishId: publishIdFromPayload,
          userId: publish?.userId,
          contentId: publish?.contentId,
          error: error.message,
        },
        "Job failed."
      );
    })().catch(() => {
      logger.error(
        {
          queue: "content-publish",
          jobId: job?.id ?? "unknown",
          publishId: publishIdFromPayload,
          error: error.message,
        },
        "Job failed."
      );
    });
  } else {
    logger.error(
      {
        queue: "content-publish",
        jobId: job?.id ?? "unknown",
        error: error.message,
      },
      "Job failed."
    );
  }
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
        id: publish.contentId,
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
      id: publish.contentId,
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
      userId: job?.data?.userId,
      contentId: job?.data?.id,
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

void recoverActiveJobActivitiesOnStartup().catch((error) => {
  logger.error(
    { error: error instanceof Error ? error.message : String(error) },
    "Failed to reconcile active job activities on worker startup."
  );
});
