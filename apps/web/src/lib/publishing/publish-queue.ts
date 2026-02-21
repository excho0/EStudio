import { sql } from "drizzle-orm";

import {
  processPublishJob,
  readPublishRow,
  updatePublish,
  type PublishJob,
} from "@/lib/publishing/publish-job-runner";
import {
  enqueuePublishQueueJob,
  isPublishQueueEnabled,
} from "@/lib/queue/publish-queue";
import {
  getDrizzleDb,
  isPostgres,
  type PostgresDrizzleDb,
  type SqliteDrizzleDb,
} from "@/lib/drizzle/client";
import { schema, sqliteSchema } from "@/lib/drizzle/schema";
import { emitPublishUpdate } from "@/lib/socket/manager";

type GlobalPublishQueue = typeof globalThis & {
  publishQueue?: PublishQueue;
};

class PublishQueue {
  private running = false;
  private queue: PublishJob[] = [];
  private scheduled: Record<string, NodeJS.Timeout> = {};
  private readonly maxAttempts = 3;
  private readonly baseDelayMs = 2000;
  initialized = false;
  private readonly nonRetryableMessages = [
    "exceeded the number of videos",
    "quota",
    "forbidden",
    "insufficient permissions",
    "not verified",
    "thumbnail",
  ];

  private isNonRetryableError(message: string) {
    const lowered = message.toLowerCase();
    return this.nonRetryableMessages.some((token) => lowered.includes(token));
  }

  private computeDelay(attempt: number) {
    const expDelay = this.baseDelayMs * Math.pow(2, attempt - 1);
    const jitter = Math.floor(Math.random() * 0.4 * expDelay);
    return expDelay + jitter;
  }

  enqueue(job: PublishJob) {
    this.queue.push(job);
    if (!this.running) {
      void this.process();
    }
  }

  private async process() {
    this.running = true;
    while (this.queue.length > 0) {
      const next = this.queue.shift();
      if (!next) break;
      try {
        await processPublishJob(next.publishId);
      } catch (error) {
        const attempt = next.attempt ?? 1;
        const message =
          error instanceof Error ? error.message : "Publish failed unexpectedly.";
        const publish = await readPublishRow(next.publishId);
        const userId = publish?.userId ?? null;
        if (!this.isNonRetryableError(message) && attempt < this.maxAttempts) {
          const nextAttempt = attempt + 1;
          const delay = this.computeDelay(nextAttempt);
          await updatePublish(next.publishId, {
            status: "queued",
            error: `Retrying upload (${nextAttempt}/${this.maxAttempts})`,
          });
          emitPublishUpdate({
            userId,
            id: next.publishId,
            jobId: next.publishId,
            status: "queued",
            error: `Retrying upload (${nextAttempt}/${this.maxAttempts})`,
          });
          this.scheduleRetry(next.publishId, nextAttempt, delay);
        } else {
          await updatePublish(next.publishId, {
            status: "failed",
            error: message,
          });
          emitPublishUpdate({
            userId,
            id: next.publishId,
            jobId: next.publishId,
            status: "failed",
            error: message,
          });
        }
      }
    }
    this.running = false;
  }

  private scheduleRetry(
    publishId: string,
    attempt: number,
    delay: number
  ) {
    if (this.scheduled[publishId]) {
      clearTimeout(this.scheduled[publishId]);
    }
    this.scheduled[publishId] = setTimeout(() => {
      delete this.scheduled[publishId];
      this.enqueue({ publishId, attempt });
    }, delay);
  }
}

export const getPublishQueue = () => {
  const globalScope = globalThis as GlobalPublishQueue;
  if (!globalScope.publishQueue) {
    globalScope.publishQueue = new PublishQueue();
  }
  if (!globalScope.publishQueue.initialized) {
    globalScope.publishQueue.initialized = true;
    void recoverPublishJobs(globalScope.publishQueue);
  }
  return globalScope.publishQueue;
};

export const enqueuePublishJob = (publishId: string) => {
  if (isPublishQueueEnabled()) {
    void enqueuePublishQueueJob({ publishId }).catch(() => {
      getPublishQueue().enqueue({ publishId, attempt: 1 });
    });
    return;
  }
  getPublishQueue().enqueue({ publishId, attempt: 1 });
};

const recoverPublishJobs = async (queue: PublishQueue) => {
  const db = getDrizzleDb();
  const statuses: Array<"queued" | "publishing"> = ["queued", "publishing"];
  const recoveryThresholdMs = Date.now() - 15000;
  const rows = isPostgres
    ? await (db as PostgresDrizzleDb)
        .select({
          id: schema.publishes.id,
          publishAttempts: schema.publishes.publishAttempts,
        })
        .from(schema.publishes)
        .where(
          sql`${schema.publishes.status} in (${sql.join(
            statuses.map((status) => sql`${status}`)
          )}) and ${schema.publishes.updatedAt} < ${new Date(recoveryThresholdMs)}`
        )
    : await (db as SqliteDrizzleDb)
        .select({
          id: sqliteSchema.publishes.id,
          publishAttempts: sqliteSchema.publishes.publishAttempts,
        })
        .from(sqliteSchema.publishes)
        .where(
          sql`${sqliteSchema.publishes.status} in (${sql.join(
            statuses.map((status) => sql`${status}`)
          )}) and ${sqliteSchema.publishes.updatedAt} < ${recoveryThresholdMs}`
        );

  await Promise.all(
    rows.map((row) =>
      updatePublish(row.id, {
        status: "queued",
        error: "Recovered after restart.",
      })
    )
  );

  rows.forEach((row) => {
    const attempt = Math.max(1, Number(row.publishAttempts ?? 0));
    queue.enqueue({ publishId: row.id, attempt });
  });
};

export { processPublishJob } from "@/lib/publishing/publish-job-runner";
