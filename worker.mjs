import "dotenv/config";
import { Worker } from "bullmq";
import IORedis from "ioredis";

const redisUrl =
  process.env.RENDER_QUEUE_REDIS_URL?.trim() || process.env.REDIS_URL?.trim() || "";
const apiBaseUrl =
  process.env.RENDER_WORKER_API_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  `http://localhost:${process.env.PORT || 3000}`;
const workerSecret = process.env.RENDER_WORKER_SECRET?.trim() || "";
const concurrency = Math.max(1, Number(process.env.RENDER_WORKER_CONCURRENCY || "1"));
const publishConcurrency = Math.max(
  1,
  Number(process.env.PUBLISH_WORKER_CONCURRENCY || "2")
);

if (!redisUrl) {
  console.error("[worker] missing REDIS_URL/RENDER_QUEUE_REDIS_URL");
  process.exit(1);
}

if (!workerSecret) {
  console.error("[worker] missing RENDER_WORKER_SECRET");
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
      throw new Error("Invalid job payload");
    }

    const response = await fetch(`${apiBaseUrl}/api/content/${id}/render`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-render-worker-secret": workerSecret,
      },
      body: JSON.stringify({
        userId,
        executeNow: true,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Render execute failed (${response.status}): ${text}`);
    }
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
    const response = await fetch(`${apiBaseUrl}/api/internal/publish`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-render-worker-secret": workerSecret,
      },
      body: JSON.stringify({ publishId }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Publish execute failed (${response.status}): ${text}`);
    }
  },
  {
    connection,
    concurrency: publishConcurrency,
  }
);

renderWorker.on("ready", () => {
  console.log(
    `[worker] ready queue=content-render concurrency=${concurrency} api=${apiBaseUrl}`
  );
});

publishWorker.on("ready", () => {
  console.log(
    `[worker] ready queue=content-publish concurrency=${publishConcurrency} api=${apiBaseUrl}`
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

const shutdown = async (signal) => {
  console.log(`[worker] shutdown signal=${signal}`);
  await Promise.all([renderWorker.close(), publishWorker.close()]);
  await connection.quit();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
