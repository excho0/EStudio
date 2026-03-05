import { and, eq } from "drizzle-orm";

import { getProviderAdapter } from "@/lib/publishing";
import {
  getContentRenderPath,
  findContentAssetPath,
  resolveContentPath,
} from "@/lib/content/store";
import { getLogger } from "@/lib/logging";
import { emitPublishProgress, emitPublishUpdate } from "@/lib/socket/manager";
import { getDrizzleDb, isPostgres, type PostgresDrizzleDb, type SqliteDrizzleDb } from "@/lib/drizzle/client";
import { schema, sqliteSchema } from "@/lib/drizzle/schema";
import { getStorage, storageKey } from "@/lib/storage";

const publishLogger = getLogger("publish-job-runner");

const normalizePublishErrorMessage = (raw: string) => {
  const lower = raw.toLowerCase();
  if (
    lower.includes("missing required authentication credential") ||
    lower.includes("invalid authentication credentials") ||
    lower.includes("token refresh failed") ||
    lower.includes("authentication is not ready")
  ) {
    return "YouTube authentication failed. Reconnect your YouTube provider and retry publish.";
  }
  return raw;
};

export type PublishJob = {
  publishId: string;
  attempt: number;
  maxAttempts?: number;
};

const parseMetadata = (value: string | null) => {
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
};

export const readPublishRow = async (publishId: string) => {
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

export const updatePublish = async (
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

export const runPublishJob = async (job: PublishJob) => {
  publishLogger.info(
    { publishId: job.publishId, attempt: job.attempt, maxAttempts: job.maxAttempts },
    "Publish job started."
  );
  const publish = await readPublishRow(job.publishId);
  if (!publish) {
    publishLogger.warn({ publishId: job.publishId }, "Publish row not found.");
    return;
  }
  publishLogger.debug(
    {
      publishId: job.publishId,
      userId: publish.userId,
      contentId: publish.contentId,
      provider: publish.provider,
      attempt: job.attempt,
      maxAttempts: job.maxAttempts,
    },
    "Publish job context resolved."
  );

  const storage = getStorage();
  const parsedPublishMetadata = parseMetadata(publish.metadata);
  const publishTitle =
    (typeof parsedPublishMetadata.title === "string"
      ? parsedPublishMetadata.title
      : null) ??
    (await readContentItemTitle(publish.userId, publish.contentId)) ??
    "Untitled upload";
  const title = publishTitle;
  const notificationMetadata = { title };

  const nextAttempt = (publish.publishAttempts ?? 0) + 1;
  await updatePublish(job.publishId, {
    status: "publishing",
    error: null,
    publishAttempts: nextAttempt,
  });
  emitPublishUpdate({
    userId: publish.userId,
    id: publish.contentId,
    jobId: job.publishId,
    status: "publishing",
    metadata: notificationMetadata,
  });

  const adapter = getProviderAdapter(publish.provider);
  if (!adapter) {
    publishLogger.warn(
      {
        publishId: job.publishId,
        userId: publish.userId,
        contentId: publish.contentId,
        provider: publish.provider,
      },
      "Publish provider adapter not found."
    );
    await updatePublish(job.publishId, {
      status: "failed",
      error: "Unknown provider.",
    });
    emitPublishUpdate({
      userId: publish.userId,
      id: publish.contentId,
      jobId: job.publishId,
      status: "failed",
      metadata: notificationMetadata,
    });
    return;
  }

  const publishMetadata = parsedPublishMetadata;
  const description =
    typeof publishMetadata.description === "string"
      ? publishMetadata.description
      : undefined;
  const options =
    typeof publishMetadata.options === "object" && publishMetadata.options !== null
      ? (publishMetadata.options as Record<string, unknown>)
      : {};

  const renderKey = getContentRenderPath(
    publish.userId,
    publish.contentId,
    publish.renderId
  );
  const renderPath = resolveContentPath(renderKey);
  if (!(await storage.exists(renderKey))) {
    publishLogger.warn(
      {
        publishId: job.publishId,
        userId: publish.userId,
        contentId: publish.contentId,
        renderKey,
      },
      "Render file missing for publish job."
    );
    await updatePublish(job.publishId, {
      status: "failed",
      error: "Render file not found.",
    });
    emitPublishUpdate({
      userId: publish.userId,
      id: publish.contentId,
      jobId: job.publishId,
      status: "failed",
      metadata: notificationMetadata,
    });
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
      providerAccountId:
        typeof publish.providerAccountId === "string"
          ? publish.providerAccountId
          : undefined,
      renderId: publish.renderId,
      renderKey,
      renderPath,
      thumbnailKey: thumbnailRelative,
      thumbnailPath,
      metadata: {
        title,
        description,
        tags: Array.isArray(publishMetadata.tags)
          ? (publishMetadata.tags as string[])
          : undefined,
        categoryId:
          typeof publishMetadata.categoryId === "string"
            ? publishMetadata.categoryId
            : undefined,
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
            id: publish.contentId,
            jobId: job.publishId,
            stage,
            metadata: notificationMetadata,
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
          id: publish.contentId,
          jobId: job.publishId,
          stage: progress.stage,
          progress:
            percent !== null ? Math.min(1, Math.max(0, percent / 100)) : undefined,
          metadata: notificationMetadata,
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
      id: publish.contentId,
      jobId: job.publishId,
      status: result.status ?? "published",
      providerAssetId: result.providerAssetId,
      error: result.warning ?? undefined,
      metadata: notificationMetadata,
    });
    publishLogger.info(
      {
        publishId: job.publishId,
        userId: publish.userId,
        contentId: publish.contentId,
        status: result.status ?? "published",
        providerAssetId: result.providerAssetId ?? null,
      },
      "Publish job completed."
    );
  } catch (error) {
    const rawMessage =
      error instanceof Error ? error.message : "Publish failed unexpectedly.";
    const message = normalizePublishErrorMessage(rawMessage);
    const attemptLabel =
      typeof job.maxAttempts === "number"
        ? `Attempt ${job.attempt}/${job.maxAttempts}`
        : `Attempt ${job.attempt}`;
    await updatePublish(job.publishId, {
      status: "failed",
      error: `${attemptLabel} failed: ${message}`,
    });
    emitPublishUpdate({
      userId: publish.userId,
      id: publish.contentId,
      jobId: job.publishId,
      status: "failed",
      error: `${attemptLabel} failed: ${message}`,
      metadata: notificationMetadata,
    });
    publishLogger.error(
      {
        publishId: job.publishId,
        userId: publish.userId,
        contentId: publish.contentId,
        attempt: job.attempt,
        maxAttempts: job.maxAttempts,
        error: message,
      },
      "Publish job failed."
    );
    throw new Error(message);
  }
};

export const processPublishJob = async (
  publishId: string,
  options?: { attempt?: number; maxAttempts?: number }
) => {
  await runPublishJob({
    publishId,
    attempt: Math.max(1, options?.attempt ?? 1),
    maxAttempts: options?.maxAttempts,
  });
};
