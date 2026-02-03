import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import type { Session } from "next-auth";

import { auth } from "@/auth";
import {
  getDrizzleDb,
  isPostgres,
  type PostgresDrizzleDb,
  type SqliteDrizzleDb,
} from "@/lib/drizzle/client";
import { schema, sqliteSchema } from "@/lib/drizzle/schema";
import { getProviderAdapter } from "@/lib/publishing";

export const runtime = "nodejs";

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

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; publishId: string }> }
) {
  const params = await context.params;
  const contentId = params.id;
  const publishId = params.publishId;
  const session = await auth();
  const email = getSessionEmail(session);
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await fetchUserByEmail(email);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const publish = await fetchPublish(user.id, contentId, publishId);
  if (!publish) {
    return NextResponse.json({ error: "Publish not found" }, { status: 404 });
  }

  const db = getDrizzleDb();
  const now = new Date();
  const pendingAsset = publish.providerAssetId.startsWith("pending-");

  if (publish.status === "deleted") {
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
      await adapter.deleteAsset({
        userId: user.id,
        providerAssetId: publish.providerAssetId,
      });
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
      .set({ status: "deleted", deletedAt: now, updatedAt: now, error: null })
      .where(eq(schema.publishes.id, publishId));
  } else {
    await (db as SqliteDrizzleDb)
      .update(sqliteSchema.publishes)
      .set({ status: "deleted", deletedAt: now, updatedAt: now, error: null })
      .where(eq(sqliteSchema.publishes.id, publishId));
  }

  return NextResponse.json({ deleted: true });
}
