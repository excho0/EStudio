import crypto from "crypto";
import { NextResponse } from "next/server";
import { and, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import type { Session } from "next-auth";

import { auth } from "@/auth";
import { getDrizzleDb, isPostgres } from "@/lib/drizzle/client";
import type { PostgresDrizzleDb, SqliteDrizzleDb } from "@/types";
import { schema, sqliteSchema } from "@/lib/drizzle/schema";
import { getProviderAdapter } from "@/lib/publishing";
import { enqueuePublishJob } from "@/lib/publishing/publish-queue";
import { PROVIDER_REGISTRY } from "@/lib/publishing/providers";

export const runtime = "nodejs";


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

const fetchUserAccountPairs = async (userId: string) => {
  const db = getDrizzleDb();
  if (isPostgres) {
    const rows = await (db as PostgresDrizzleDb)
      .select({
        provider: schema.accounts.provider,
        providerAccountId: schema.accounts.providerAccountId,
      })
      .from(schema.accounts)
      .where(eq(schema.accounts.userId, userId));
    return rows.map((row) => ({
      ...row,
      provider: resolveProviderKey(row.provider),
    }));
  }
  const rows = await (db as SqliteDrizzleDb)
    .select({
      provider: sqliteSchema.accounts.provider,
      providerAccountId: sqliteSchema.accounts.providerAccountId,
    })
    .from(sqliteSchema.accounts)
    .where(eq(sqliteSchema.accounts.userId, userId));
  return rows.map((row) => ({
    ...row,
    provider: resolveProviderKey(row.provider),
  }));
};

const publishSchema = z.object({
  renderId: z.string().trim().min(1),
  provider: z.string().trim().min(1),
  connectionId: z.string().trim().min(1),
  providerAssetId: z.string().trim().min(1),
  status: z
    .enum(["draft", "queued", "publishing", "published", "failed"])
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

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

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const contentId = params.id;
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

  const accountPairs = await fetchUserAccountPairs(user.id);
  if (accountPairs.length === 0) {
    return NextResponse.json({ publishes: [] });
  }

  const db = getDrizzleDb();
  const publishes = isPostgres
    ? await (db as PostgresDrizzleDb)
        .select()
        .from(schema.publishes)
        .where(
          and(
            eq(schema.publishes.userId, user.id),
            eq(schema.publishes.contentId, contentId),
            or(
              ...accountPairs.map((account) =>
                and(
                  eq(schema.publishes.provider, account.provider),
                  eq(schema.publishes.providerAccountId, account.providerAccountId)
                )
              )
            )
          )
        )
    : await (db as SqliteDrizzleDb)
        .select()
        .from(sqliteSchema.publishes)
        .where(
          and(
            eq(sqliteSchema.publishes.userId, user.id),
            eq(sqliteSchema.publishes.contentId, contentId),
            or(
              ...accountPairs.map((account) =>
                and(
                  eq(sqliteSchema.publishes.provider, account.provider),
                  eq(sqliteSchema.publishes.providerAccountId, account.providerAccountId)
                )
              )
            )
          )
        );

  const publishTargets = await fetchPublishTargets(request);

  return NextResponse.json({
    publishes,
    publishTargets,
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const contentId = params.id;
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
  const id = crypto.randomUUID();
  const metadata =
    payload.data.metadata && Object.keys(payload.data.metadata).length > 0
      ? JSON.stringify(payload.data.metadata)
      : null;
  const status = "queued";

  if (isPostgres) {
    const [record] = await (db as PostgresDrizzleDb)
      .insert(schema.publishes)
      .values({
        id,
        userId: user.id,
        contentId,
        renderId: payload.data.renderId,
        provider: payload.data.provider,
        connectionId: payload.data.connectionId,
        providerAccountId: payload.data.connectionId,
        providerAssetId: payload.data.providerAssetId,
        status,
        metadata,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    enqueuePublishJob(record.id);
    return NextResponse.json({ publish: record });
  }

  await (db as SqliteDrizzleDb).insert(sqliteSchema.publishes).values({
    id,
    userId: user.id,
    contentId,
    renderId: payload.data.renderId,
    provider: payload.data.provider,
    connectionId: payload.data.connectionId,
    providerAccountId: payload.data.connectionId,
    providerAssetId: payload.data.providerAssetId,
    status,
    metadata,
    createdAt: now,
    updatedAt: now,
  });

  enqueuePublishJob(id);
  return NextResponse.json({ publish: { id, status } });
}
