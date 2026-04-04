import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import type { Session } from "next-auth";

import { auth } from "@/auth";
import { getDrizzleDb, isPostgres } from "@/lib/drizzle/client";
import type { PostgresDrizzleDb, SqliteDrizzleDb } from "@/types";
import { schema, sqliteSchema } from "@/lib/drizzle/schema";
import { getProviderAdapter } from "@/lib/publishing";
import { enqueuePublishJob } from "@/lib/publishing/publish-queue";
import { emitPublishUpdate } from "@/lib/socket/manager";
import { getStorage } from "@/lib/storage";
import { getUserPublishesDir } from "@/lib/content/store";

const storage = getStorage();

const getSessionEmail = (session: Session | null) => session?.user?.email ?? null;

const fetchUserByEmail = async (email: string) => {
  const db = getDrizzleDb();
  if (isPostgres) {
    const [user] = await (db as PostgresDrizzleDb)
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    return user ?? null;
  }
  const [user] = await (db as SqliteDrizzleDb)
    .select()
    .from(sqliteSchema.users)
    .where(eq(sqliteSchema.users.email, email))
    .limit(1);
  return user ?? null;
};

const fetchPublish = async (userId: string, contentId: string, publishId: string) => {
  const db = getDrizzleDb();
  if (isPostgres) {
    const [publish] = await (db as PostgresDrizzleDb)
      .select({
        id: schema.publishes.id,
        provider: schema.publishes.provider,
        providerAssetId: schema.publishes.providerAssetId,
        status: schema.publishes.status,
        metadata: schema.publishes.metadata,
      })
      .from(schema.publishes)
      .where(
        and(
          eq(schema.publishes.id, publishId),
          eq(schema.publishes.userId, userId),
          eq(schema.publishes.contentId, contentId)
        )
      )
      .limit(1);
    return publish ?? null;
  }
  const [publish] = await (db as SqliteDrizzleDb)
    .select({
      id: sqliteSchema.publishes.id,
      provider: sqliteSchema.publishes.provider,
      providerAssetId: sqliteSchema.publishes.providerAssetId,
      status: sqliteSchema.publishes.status,
      metadata: sqliteSchema.publishes.metadata,
    })
    .from(sqliteSchema.publishes)
    .where(
      and(
        eq(sqliteSchema.publishes.id, publishId),
        eq(sqliteSchema.publishes.userId, userId),
        eq(sqliteSchema.publishes.contentId, contentId)
      )
    )
    .limit(1);
  return publish ?? null;
};

const parsePublishMetadata = (metadata: string | null) => {
  if (!metadata) return null;
  try {
    return JSON.parse(metadata) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const deletePublishThumbnailAsset = async (userId: string, metadata: string | null) => {
  const parsed = parsePublishMetadata(metadata);
  const thumbnailAssetPath =
    typeof parsed?.thumbnailAssetPath === "string"
      ? parsed.thumbnailAssetPath
      : null;
  if (!thumbnailAssetPath) return;
  const publishAssetsRoot = getUserPublishesDir(userId);
  if (!thumbnailAssetPath.startsWith(publishAssetsRoot)) return;
  await storage.deleteFile(thumbnailAssetPath).catch(() => {});
};

const resolveAuthAndPublish = async (contentId: string, publishId: string) => {
  const session = await auth();
  const email = getSessionEmail(session);
  if (!email) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const user = await fetchUserByEmail(email);
  if (!user) {
    return { error: NextResponse.json({ error: "User not found" }, { status: 404 }) };
  }

  const publish = await fetchPublish(user.id, contentId, publishId);
  if (!publish) {
    return { error: NextResponse.json({ error: "Publish not found" }, { status: 404 }) };
  }

  return { user, publish };
};

export const handleDeletePublish = async (contentId: string, publishId: string) => {
  const resolved = await resolveAuthAndPublish(contentId, publishId);
  if ("error" in resolved) return resolved.error;
  const { user, publish } = resolved;

  const db = getDrizzleDb();
  const now = new Date();
  const pendingAsset =
    typeof publish.providerAssetId === "string" &&
    publish.providerAssetId.startsWith("pending-");

  if (publish.status === "deleted") {
    await deletePublishThumbnailAsset(user.id, publish.metadata ?? null);
    if (isPostgres) {
      await (db as PostgresDrizzleDb)
        .delete(schema.publishes)
        .where(
          and(
            eq(schema.publishes.id, publishId),
            eq(schema.publishes.userId, user.id)
          )
        );
    } else {
      await (db as SqliteDrizzleDb)
        .delete(sqliteSchema.publishes)
        .where(
          and(
            eq(sqliteSchema.publishes.id, publishId),
            eq(sqliteSchema.publishes.userId, user.id)
          )
        );
    }
    return NextResponse.json({ deleted: true, removed: true });
  }

  if (pendingAsset) {
    if (publish.status === "queued" || publish.status === "publishing") {
      return NextResponse.json(
        { error: "Publish is still in progress." },
        { status: 409 }
      );
    }
  } else {
    const adapter = getProviderAdapter(publish.provider);
    if (!adapter?.deleteAsset) {
      return NextResponse.json(
        { error: "Provider does not support deletes." },
        { status: 400 }
      );
    }

    try {
      if (publish.providerAssetId) {
        await adapter.deleteAsset({
          userId: user.id,
          providerAssetId: publish.providerAssetId,
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to delete publish.";
      if (isPostgres) {
        await (db as PostgresDrizzleDb)
          .update(schema.publishes)
          .set({ error: message, updatedAt: now })
          .where(eq(schema.publishes.id, publishId));
      } else {
        await (db as SqliteDrizzleDb)
          .update(sqliteSchema.publishes)
          .set({ error: message, updatedAt: now })
          .where(eq(sqliteSchema.publishes.id, publishId));
      }
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  if (isPostgres) {
    await (db as PostgresDrizzleDb)
      .update(schema.publishes)
      .set({
        status: "deleted",
        deletedAt: now,
        updatedAt: now,
        error: null,
        providerAssetId: null,
      })
      .where(eq(schema.publishes.id, publishId));
  } else {
    await (db as SqliteDrizzleDb)
      .update(sqliteSchema.publishes)
      .set({
        status: "deleted",
        deletedAt: now,
        updatedAt: now,
        error: null,
        providerAssetId: null,
      })
      .where(eq(sqliteSchema.publishes.id, publishId));
  }

  await deletePublishThumbnailAsset(user.id, publish.metadata ?? null);

  return NextResponse.json({ deleted: true });
};

export const handleRetryPublish = async (contentId: string, publishId: string) => {
  const resolved = await resolveAuthAndPublish(contentId, publishId);
  if ("error" in resolved) return resolved.error;
  const { user, publish } = resolved;

  if (publish.status !== "failed") {
    return NextResponse.json({ error: "Publish is not retryable." }, { status: 409 });
  }

  const db = getDrizzleDb();
  const now = new Date();
  if (isPostgres) {
    await (db as PostgresDrizzleDb)
      .update(schema.publishes)
      .set({ status: "queued", error: null, updatedAt: now })
      .where(eq(schema.publishes.id, publishId));
  } else {
    await (db as SqliteDrizzleDb)
      .update(sqliteSchema.publishes)
      .set({ status: "queued", error: null, updatedAt: now })
      .where(eq(sqliteSchema.publishes.id, publishId));
  }

  enqueuePublishJob(publishId);
  const parsedMetadata = parsePublishMetadata(publish.metadata ?? null) as
    | { title?: unknown }
    | null;
  const metadataTitle =
    typeof parsedMetadata?.title === "string" && parsedMetadata.title.trim().length > 0
      ? parsedMetadata.title.trim()
      : undefined;
  const metadata = metadataTitle ? { title: metadataTitle } : undefined;

  emitPublishUpdate({
    userId: user.id,
    id: contentId,
    jobId: publishId,
    status: "queued",
    metadata,
  });
  return NextResponse.json({ queued: true });
};
