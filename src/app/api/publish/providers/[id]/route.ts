import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import type { Session } from "next-auth";

import { auth } from "@/auth";
import { getDrizzleDb, isPostgres } from "@/lib/drizzle/client";
import type { PostgresDrizzleDb, SqliteDrizzleDb } from "@/types";
import { schema, sqliteSchema } from "@/lib/drizzle/schema";
import { getProviderDefinitionServer } from "@/lib/publishing/providers/registry.server";

export const runtime = "nodejs";

const getSessionEmail = (session: Session | null) =>
  session?.user?.email ?? null;

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

const removeProviderAccount = async (userId: string, providerId: string) => {
  const db = getDrizzleDb();
  if (isPostgres) {
    await (db as PostgresDrizzleDb)
      .delete(schema.accounts)
      .where(
        and(
          eq(schema.accounts.userId, userId),
          eq(schema.accounts.provider, providerId)
        )
      );
    return;
  }
  await (db as SqliteDrizzleDb)
    .delete(sqliteSchema.accounts)
    .where(
      and(
        eq(sqliteSchema.accounts.userId, userId),
        eq(sqliteSchema.accounts.provider, providerId)
      )
    );
};

const resolveProviderConnection = async (providerId: string, userId: string) => {
  const definition = getProviderDefinitionServer(providerId);
  if (!definition?.getConnection) return { connected: false };
  return definition.getConnection(userId);
};

const clearProviderCaches = async (providerId: string, userId: string) => {
  const definition = getProviderDefinitionServer(providerId);
  if (definition?.clearCache) {
    await definition.clearCache(userId);
  }
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const providerKey = params.id;
  const provider = getProviderDefinitionServer(providerKey);
  if (!provider) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  const session = await auth();
  const email = getSessionEmail(session);
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await fetchUserByEmail(email);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (!provider.oauthProviderId) {
    return NextResponse.json({ connected: false });
  }

  const connection = await resolveProviderConnection(provider.id, user.id);
  return NextResponse.json(connection);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const providerKey = params.id;
  const provider = getProviderDefinitionServer(providerKey);
  if (!provider) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  const session = await auth();
  const email = getSessionEmail(session);
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await fetchUserByEmail(email);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (!provider.oauthProviderId) {
    return NextResponse.json({ ok: true });
  }

  await removeProviderAccount(user.id, provider.oauthProviderId);
  await clearProviderCaches(provider.id, user.id);

  return NextResponse.json({ ok: true });
}
