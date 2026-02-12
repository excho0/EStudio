import crypto from "crypto";
import { NextResponse } from "next/server";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import type { Session } from "next-auth";

import { auth } from "@/auth";
import { getDrizzleDb, isPostgres } from "@/lib/drizzle/client";
import type { PostgresDrizzleDb, SqliteDrizzleDb } from "@/types";
import { schema, sqliteSchema } from "@/lib/drizzle/schema";
import { getProviderAdapter } from "@/lib/publishing";
import { enqueuePublishJob } from "@/lib/publishing/publish-queue";
import { PROVIDER_REGISTRY } from "@/lib/publishing/providers";
import { eventBus } from "@/lib/event-bus";
import { emitPublishUpdate } from "@/lib/socket/manager";

const getSessionEmail = (session: Session | null) =>
  session?.user?.email ?? null;

const getRequestBaseUrl = (request: Request) => {
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  const forwardedHost = request.headers.get("x-forwarded-host");
  const hostHeader = request.headers.get("host");
  const pickHost = (value: string | null) =>
    value && !value.startsWith("0.0.0.0") ? value : null;
  const host = pickHost(forwardedHost) ?? pickHost(hostHeader);
  if (host) {
    return `${proto}://${host}`;
  }
  const origin = new URL(request.url).origin;
  return origin.replace("0.0.0.0", "localhost");
};

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

const fetchContentItem = async (userId: string, id: string) => {
  const db = getDrizzleDb();
  if (isPostgres) {
    const [item] = await (db as PostgresDrizzleDb)
      .select({ id: schema.contentItems.id })
      .from(schema.contentItems)
      .where(and(eq(schema.contentItems.id, id), eq(schema.contentItems.userId, userId)))
      .limit(1);
    return item ?? null;
  }
  const [item] = await (db as SqliteDrizzleDb)
    .select({ id: sqliteSchema.contentItems.id })
    .from(sqliteSchema.contentItems)
    .where(and(eq(sqliteSchema.contentItems.id, id), eq(sqliteSchema.contentItems.userId, userId)))
    .limit(1);
  return item ?? null;
};

const resolveProviderKey = (providerId: string) => {
  if (PROVIDER_REGISTRY[providerId as keyof typeof PROVIDER_REGISTRY]) {
    return providerId;
  }
  const match = Object.values(PROVIDER_REGISTRY).find(
    (provider) => provider.oauthProviderId === providerId
  );
  return match?.id ?? providerId;
};

const fetchAccountByProviderAccountId = async (
  userId: string,
  providerId: string,
  providerAccountId: string
) => {
  const db = getDrizzleDb();
  const providerKey = resolveProviderKey(providerId);
  const provider = PROVIDER_REGISTRY[providerKey as keyof typeof PROVIDER_REGISTRY];
  const providerAccountProviderId = provider?.oauthProviderId ?? providerKey;
  if (isPostgres) {
    const [account] = await (db as PostgresDrizzleDb)
      .select({
        provider: schema.accounts.provider,
        providerAccountId: schema.accounts.providerAccountId,
      })
      .from(schema.accounts)
      .where(
        and(
          eq(schema.accounts.userId, userId),
          eq(schema.accounts.provider, providerAccountProviderId),
          eq(schema.accounts.providerAccountId, providerAccountId)
        )
      )
      .limit(1);
    return account ?? null;
  }
  const [account] = await (db as SqliteDrizzleDb)
    .select({
      provider: sqliteSchema.accounts.provider,
      providerAccountId: sqliteSchema.accounts.providerAccountId,
    })
    .from(sqliteSchema.accounts)
    .where(
      and(
        eq(sqliteSchema.accounts.userId, userId),
        eq(sqliteSchema.accounts.provider, providerAccountProviderId),
        eq(sqliteSchema.accounts.providerAccountId, providerAccountId)
      )
    )
    .limit(1);
  return account ?? null;
};

const publishSchema = z.object({
  renderId: z.string().trim().min(1),
  provider: z.string().trim().min(1),
  connectionId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
  providerAssetId: z.string().trim().min(1).nullable().optional(),
  status: z
    .enum(["draft", "queued", "publishing", "published", "failed"])
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const resolveIdempotencyKey = (
  request: Request,
  payloadKey?: string
) => {
  const headerKey = request.headers.get("idempotency-key")?.trim() ?? "";
  const key = payloadKey?.trim() || headerKey;
  return key.length > 0 ? key : null;
};

const createDeterministicPublishId = (
  userId: string,
  contentId: string,
  provider: string,
  renderId: string,
  connectionId: string,
  idempotencyKey: string
) =>
  crypto
    .createHash("sha256")
    .update(
      `${userId}:${contentId}:${provider}:${renderId}:${connectionId}:${idempotencyKey}`
    )
    .digest("hex")
    .slice(0, 32);

const failStalePublishes = async (
  userId: string,
  contentId: string,
  staleBeforeMs: number
) => {
  const db = getDrizzleDb();
  const staleBeforeDate = new Date(staleBeforeMs);
  const staleStatuses = ["queued", "publishing"] as const;
  const staleRows = isPostgres
    ? await (db as PostgresDrizzleDb)
        .select({ id: schema.publishes.id })
        .from(schema.publishes)
        .where(
          and(
            eq(schema.publishes.userId, userId),
            eq(schema.publishes.contentId, contentId),
            inArray(schema.publishes.status, staleStatuses),
            isNull(schema.publishes.deletedAt),
            isNull(schema.publishes.providerAssetId),
            lt(schema.publishes.updatedAt, staleBeforeDate)
          )
        )
    : await (db as SqliteDrizzleDb)
        .select({ id: sqliteSchema.publishes.id })
        .from(sqliteSchema.publishes)
        .where(
          and(
            eq(sqliteSchema.publishes.userId, userId),
            eq(sqliteSchema.publishes.contentId, contentId),
            inArray(sqliteSchema.publishes.status, staleStatuses),
            isNull(sqliteSchema.publishes.deletedAt),
            isNull(sqliteSchema.publishes.providerAssetId),
            lt(sqliteSchema.publishes.updatedAt, staleBeforeDate)
          )
        );

  const staleIds = staleRows.map((row) => row.id).filter(Boolean);
  if (staleIds.length === 0) {
    return;
  }

  if (isPostgres) {
    await (db as PostgresDrizzleDb)
      .update(schema.publishes)
      .set({
        status: "failed",
        error: "Marked failed due to stale publish timeout.",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.publishes.userId, userId),
          eq(schema.publishes.contentId, contentId),
          inArray(schema.publishes.id, staleIds),
          inArray(schema.publishes.status, staleStatuses)
        )
      );
  } else {
    await (db as SqliteDrizzleDb)
      .update(sqliteSchema.publishes)
      .set({
        status: "failed",
        error: "Marked failed due to stale publish timeout.",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sqliteSchema.publishes.userId, userId),
          eq(sqliteSchema.publishes.contentId, contentId),
          inArray(sqliteSchema.publishes.id, staleIds),
          inArray(sqliteSchema.publishes.status, staleStatuses)
        )
      );
  }

  for (const publishId of staleIds) {
    emitPublishUpdate({
      userId,
      id: publishId,
      status: "failed",
      error: "Marked failed due to stale publish timeout.",
    });
  }
};

const fetchPublishTargets = async (request: Request) => {
  try {
    const baseUrl = getRequestBaseUrl(request);
    const response = await fetch(new URL("/api/publish/providers", baseUrl));
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      publishTargets?: Array<{ id: string; label: string; status?: string }>;
    };
    return payload.publishTargets ?? [];
  } catch {
    return [];
  }
};

export const handleListPublishes = async (request: Request, contentId: string) => {
  const session = await auth();
  const email = getSessionEmail(session);
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await fetchUserByEmail(email);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const contentItem = await fetchContentItem(user.id, contentId);
  if (!contentItem) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  const staleTimeoutMs = Math.max(
    10_000,
    Number(process.env.PUBLISH_STALE_TIMEOUT_MS ?? "180000")
  );
  await failStalePublishes(user.id, contentId, Date.now() - staleTimeoutMs);

  const db = getDrizzleDb();
  const publishes = isPostgres
    ? await (db as PostgresDrizzleDb)
        .select()
        .from(schema.publishes)
        .where(
          and(
            eq(schema.publishes.userId, user.id),
            eq(schema.publishes.contentId, contentId)
          )
        )
    : await (db as SqliteDrizzleDb)
        .select()
        .from(sqliteSchema.publishes)
        .where(
          and(
            eq(sqliteSchema.publishes.userId, user.id),
            eq(sqliteSchema.publishes.contentId, contentId)
          )
        );

  const publishTargets = await fetchPublishTargets(request);

  return NextResponse.json({ publishes, publishTargets });
};

export const handleCreatePublish = async (request: Request, contentId: string) => {
  const session = await auth();
  const email = getSessionEmail(session);
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await fetchUserByEmail(email);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const contentItem = await fetchContentItem(user.id, contentId);
  if (!contentItem) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  const payload = publishSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const idempotencyKey = resolveIdempotencyKey(request, payload.data.idempotencyKey);

  const adapter = getProviderAdapter(payload.data.provider);
  if (!adapter) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  const account = await fetchAccountByProviderAccountId(
    user.id,
    payload.data.provider,
    payload.data.connectionId
  );
  if (!account) {
    return NextResponse.json(
      { error: "Provider account not connected." },
      { status: 400 }
    );
  }

  const activeStatuses = ["queued", "publishing"] as const;
  const db = getDrizzleDb();
  if (isPostgres) {
    const [existing] = await (db as PostgresDrizzleDb)
      .select({ id: schema.publishes.id, status: schema.publishes.status })
      .from(schema.publishes)
      .where(
        and(
          eq(schema.publishes.userId, user.id),
          eq(schema.publishes.contentId, contentId),
          eq(schema.publishes.provider, payload.data.provider),
          eq(schema.publishes.renderId, payload.data.renderId),
          inArray(schema.publishes.status, activeStatuses)
        )
      )
      .limit(1);
    if (existing?.id) {
      return NextResponse.json({ publish: existing });
    }
  } else {
    const [existing] = await (db as SqliteDrizzleDb)
      .select({ id: sqliteSchema.publishes.id, status: sqliteSchema.publishes.status })
      .from(sqliteSchema.publishes)
      .where(
        and(
          eq(sqliteSchema.publishes.userId, user.id),
          eq(sqliteSchema.publishes.contentId, contentId),
          eq(sqliteSchema.publishes.provider, payload.data.provider),
          eq(sqliteSchema.publishes.renderId, payload.data.renderId),
          inArray(sqliteSchema.publishes.status, activeStatuses)
        )
      )
      .limit(1);
    if (existing?.id) {
      return NextResponse.json({ publish: existing });
    }
  }

  const now = new Date();
  const id = idempotencyKey
    ? createDeterministicPublishId(
        user.id,
        contentId,
        payload.data.provider,
        payload.data.renderId,
        payload.data.connectionId,
        idempotencyKey
      )
    : crypto.randomUUID();
  const metadataPayload: Record<string, unknown> = payload.data.metadata
    ? { ...payload.data.metadata }
    : {};
  if (idempotencyKey) {
    metadataPayload.idempotencyKey = idempotencyKey;
  }
  const metadata =
    Object.keys(metadataPayload).length > 0 ? JSON.stringify(metadataPayload) : null;
  const status = "queued";

  if (isPostgres) {
    let record;
    try {
      [record] = await (db as PostgresDrizzleDb)
        .insert(schema.publishes)
        .values({
          id,
          userId: user.id,
          contentId,
          renderId: payload.data.renderId,
          provider: payload.data.provider,
          connectionId: payload.data.connectionId,
          providerAccountId: payload.data.connectionId,
          providerAssetId: payload.data.providerAssetId ?? null,
          status,
          metadata,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
    } catch {
      [record] = await (db as PostgresDrizzleDb)
        .select()
        .from(schema.publishes)
        .where(eq(schema.publishes.id, id))
        .limit(1);
    }
    if (!record) {
      return NextResponse.json({ error: "Failed to create publish." }, { status: 500 });
    }
    enqueuePublishJob(record.id);
    void eventBus.emit("publish.queued", {
      userId: user.id,
      id: record.id,
      contentId,
      provider: payload.data.provider,
    });
    return NextResponse.json({ publish: record });
  }

  try {
    await (db as SqliteDrizzleDb).insert(sqliteSchema.publishes).values({
      id,
      userId: user.id,
      contentId,
      renderId: payload.data.renderId,
      provider: payload.data.provider,
      connectionId: payload.data.connectionId,
      providerAccountId: payload.data.connectionId,
      providerAssetId: payload.data.providerAssetId ?? null,
      status,
      metadata,
      createdAt: now,
      updatedAt: now,
    });
  } catch {
    // Treat duplicate deterministic idempotency inserts as success.
  }

  const [record] = await (db as SqliteDrizzleDb)
    .select()
    .from(sqliteSchema.publishes)
    .where(eq(sqliteSchema.publishes.id, id))
    .limit(1);

  if (record?.id) {
    enqueuePublishJob(record.id);
    void eventBus.emit("publish.queued", {
      userId: user.id,
      id: record.id,
      contentId,
      provider: payload.data.provider,
    });
  }

  return NextResponse.json({ publish: record ?? null });
};
