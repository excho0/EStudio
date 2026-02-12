import { and, eq } from "drizzle-orm";

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
      id: job.publishId,
      status: "failed",
      error: `${attemptLabel} failed: ${message}`,
    });
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
