import { and, eq, sql } from "drizzle-orm";

import { getProviderAdapter } from "@/lib/publishing";
import {
  getContentRenderPath,
  findContentAssetPath,
  resolveContentPath,
} from "@/lib/content/store";
import { emitPublishProgress, emitPublishUpdate } from "@/lib/socket/manager";
import { getDrizzleDb, isPostgres, type PostgresDrizzleDb, type SqliteDrizzleDb } from "@/lib/drizzle/client";
import { schema, sqliteSchema } from "@/lib/drizzle/schema";
import { getStorage, storageKey } from "@/lib/storage";
import {
  enqueuePublishQueueJob,
  isPublishQueueEnabled,
} from "@/lib/queue/publish-queue";


type PublishJob = {
  publishId: string;
  attempt: number;
};

type GlobalPublishQueue = typeof globalThis & {
  publishQueue?: PublishQueue;
};

const parseMetadata = (value: string | null) => {
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const readPublishRow = async (publishId: string) => {
  const db = getDrizzleDb();
  if (isPostgres) {
    const [publish] = await (db as PostgresDrizzleDb)
      .select()
      .from(schema.publishes)
      .where(eq(schema.publishes.id, publishId))
      .limit(1);
    return publish ?? null;
  }
  const [publish] = await (db as SqliteDrizzleDb)
    .select()
    .from(sqliteSchema.publishes)
    .where(eq(sqliteSchema.publishes.id, publishId))
    .limit(1);
  return publish ?? null;
};

const readContentItemTitle = async (userId: string, contentId: string) => {
  const db = getDrizzleDb();
  if (isPostgres) {
    const [item] = await (db as PostgresDrizzleDb)
      .select({ title: schema.contentItems.title })
      .from(schema.contentItems)
      .where(
        and(eq(schema.contentItems.id, contentId), eq(schema.contentItems.userId, userId))
      )
      .limit(1);
    return item?.title ?? null;
  }
  const [item] = await (db as SqliteDrizzleDb)
    .select({ title: sqliteSchema.contentItems.title })
    .from(sqliteSchema.contentItems)
    .where(
      and(
        eq(sqliteSchema.contentItems.id, contentId),
        eq(sqliteSchema.contentItems.userId, userId)
      )
    )
    .limit(1);
  return item?.title ?? null;
};

const updatePublish = async (
  publishId: string,
  updates: Record<string, unknown>
) => {
  const now = new Date();
  const values = {
    ...updates,
    updatedAt: now,
  };
  const db = getDrizzleDb();
  if (isPostgres) {
    await (db as PostgresDrizzleDb)
      .update(schema.publishes)
      .set(values)
      .where(eq(schema.publishes.id, publishId));
    return;
  }
  await (db as SqliteDrizzleDb)
    .update(sqliteSchema.publishes)
    .set(values)
    .where(eq(sqliteSchema.publishes.id, publishId));
};

const runPublishJob = async (job: PublishJob) => {
  const publish = await readPublishRow(job.publishId);
  if (!publish) return;

  const storage = getStorage();

  const nextAttempt = (publish.publishAttempts ?? 0) + 1;
  await updatePublish(job.publishId, {
    status: "publishing",
    error: null,
    publishAttempts: nextAttempt,
  });
  emitPublishUpdate({ userId: publish.userId, id: job.publishId, status: "publishing" });

  const adapter = getProviderAdapter(publish.provider);
  if (!adapter) {
    await updatePublish(job.publishId, {
      status: "failed",
      error: "Unknown provider.",
    });
    emitPublishUpdate({ userId: publish.userId, id: job.publishId, status: "failed" });
    return;
  }

  const metadata = parseMetadata(publish.metadata);
  const title =
    (typeof metadata.title === "string" ? metadata.title : null) ??
    (await readContentItemTitle(publish.userId, publish.contentId)) ??
    "Untitled upload";
  const description =
    typeof metadata.description === "string" ? metadata.description : undefined;
  const options =
    typeof metadata.options === "object" && metadata.options !== null
      ? (metadata.options as Record<string, unknown>)
      : {};

  const renderKey = getContentRenderPath(
    publish.userId,
    publish.contentId,
    publish.renderId
  );
  const renderPath = resolveContentPath(renderKey);
  if (!(await storage.exists(renderKey))) {
    await updatePublish(job.publishId, {
      status: "failed",
      error: "Render file not found.",
    });
    emitPublishUpdate({ userId: publish.userId, id: job.publishId, status: "failed" });
    return;
  }
  const thumbnailRelative = await findContentAssetPath(
    publish.userId,
    publish.contentId,
    "thumbnail"
  );
  const thumbnailPath = thumbnailRelative
    ? resolveContentPath(storageKey(thumbnailRelative))
    : null;

  try {
    let lastPercent: number | null = null;
    let lastStage: string | null = null;
    const result = await adapter.upload({
      userId: publish.userId,
      contentId: publish.contentId,
      renderId: publish.renderId,
      renderKey,
      renderPath,
      thumbnailKey: thumbnailRelative,
      thumbnailPath,
      metadata: {
        title,
        description,
        tags: Array.isArray(metadata.tags) ? (metadata.tags as string[]) : undefined,
        categoryId:
          typeof metadata.categoryId === "string" ? metadata.categoryId : undefined,
      },
      options: {
        privacy:
          typeof options.privacy === "string"
            ? (options.privacy as "public" | "unlisted" | "private")
            : undefined,
        scheduleAt:
          typeof options.scheduleAt === "string" ? options.scheduleAt : undefined,
      },
      onProgress: (progress) => {
        const percent =
          typeof progress.progress === "number"
            ? Math.floor(progress.progress * 100)
            : null;
        const stage = progress.stage ?? null;
        if (stage && stage !== lastStage && stage !== "uploading") {
          lastStage = stage;
          emitPublishProgress({
            userId: publish.userId,
            id: job.publishId,
            stage,
          });
          return;
        }
        if (percent === null || percent === lastPercent) {
          return;
        }
        lastStage = stage ?? lastStage;
        lastPercent = percent;
        emitPublishProgress({
          userId: publish.userId,
          id: job.publishId,
          stage: progress.stage,
          progress:
            percent !== null ? Math.min(1, Math.max(0, percent / 100)) : undefined,
        });
      },
    });

    await updatePublish(job.publishId, {
      status: result.status ?? "published",
      providerAssetId: result.providerAssetId ?? publish.providerAssetId,
      publishedAt:
        result.status === "published" ||
        result.status === "published_with_warning" ||
        result.status === undefined
          ? new Date()
          : null,
      error: result.warning ?? null,
    });
    emitPublishUpdate({
      userId: publish.userId,
      id: job.publishId,
      status: result.status ?? "published",
      providerAssetId: result.providerAssetId,
      error: result.warning ?? undefined,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Publish failed unexpectedly.";
    throw new Error(message);
  }
};

export const processPublishJob = async (publishId: string) => {
  await runPublishJob({ publishId, attempt: 1 });
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
        await runPublishJob(next);
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
