import "dotenv/config";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { executeRenderForContent } from "./src/lib/rendering/content-render-runner";
import { processPublishJob } from "./src/lib/publishing/publish-queue";

const redisUrl =
  process.env.RENDER_QUEUE_REDIS_URL?.trim() || process.env.REDIS_URL?.trim() || "";
const concurrency = Math.max(1, Number(process.env.RENDER_WORKER_CONCURRENCY || "1"));
const publishConcurrency = Math.max(
  1,
  Number(process.env.PUBLISH_WORKER_CONCURRENCY || "2")
);

if (!redisUrl) {
  console.error("[worker] missing REDIS_URL/RENDER_QUEUE_REDIS_URL");
  process.exit(1);
}

const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

const renderWorker = new Worker(
  "content-render",
  async (job) => {
    const { id, userId } = job.data ?? {};
    if (!id || !userId) {
      throw new Error("Invalid render payload");
    }
    await executeRenderForContent({ userId, id });
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
    await processPublishJob(publishId);
  },
  {
    connection,
    concurrency: publishConcurrency,
  }
);

renderWorker.on("ready", () => {
  console.log(`[worker] ready queue=content-render concurrency=${concurrency}`);
});

publishWorker.on("ready", () => {
  console.log(
    `[worker] ready queue=content-publish concurrency=${publishConcurrency}`
  );
});

renderWorker.on("completed", (job) => {
  console.log(`[worker] completed render job=${job.id}`);
});

publishWorker.on("completed", (job) => {
  console.log(`[worker] completed publish job=${job.id}`);
});

renderWorker.on("failed", (job, error) => {
  console.error(
    `[worker] failed render job=${job?.id ?? "unknown"} error=${error.message}`
  );
});

publishWorker.on("failed", (job, error) => {
  console.error(
    `[worker] failed publish job=${job?.id ?? "unknown"} error=${error.message}`
  );
});

const shutdown = async (signal: string) => {
  console.log(`[worker] shutdown signal=${signal}`);
  await Promise.all([renderWorker.close(), publishWorker.close()]);
  await connection.quit();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
