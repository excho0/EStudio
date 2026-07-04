import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import type { Session } from "next-auth";

import { auth } from "@/auth";
import { getDrizzleDb, isPostgres } from "@/lib/drizzle/client";
import type { PostgresDrizzleDb, SqliteDrizzleDb } from "@/types";
import { schema, sqliteSchema } from "@/lib/drizzle/schema";
import { getProviderDefinitionServer } from "@/lib/publishing/providers/registry.server";

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

const resolveUserId = async (
  userId?: string
): Promise<{ userId: string } | { error: Response }> => {
  if (userId) return { userId };
  const session = await auth();
  const email = getSessionEmail(session);
  if (!email) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const user = await fetchUserByEmail(email);
  if (!user) {
    return { error: NextResponse.json({ error: "User not found" }, { status: 404 }) };
  }
  return { userId: user.id };
};

export const handleGetPublishProvider = async (
  providerKey: string,
  userId?: string
) => {
  const provider = getProviderDefinitionServer(providerKey);
  if (!provider) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  const resolved = await resolveUserId(userId);
  if ("error" in resolved) return resolved.error;

  if (!provider.oauthProviderId) {
    return NextResponse.json({ connected: false });
  }

  const connection = await resolveProviderConnection(provider.id, resolved.userId);
  return NextResponse.json(connection);
};

export const handleDeletePublishProvider = async (
  providerKey: string,
  userId?: string
) => {
  const provider = getProviderDefinitionServer(providerKey);
  if (!provider) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  const resolved = await resolveUserId(userId);
  if ("error" in resolved) return resolved.error;

  if (!provider.oauthProviderId) {
    return NextResponse.json({ ok: true });
  }

  await removeProviderAccount(resolved.userId, provider.oauthProviderId);
  await clearProviderCaches(provider.id, resolved.userId);

  return NextResponse.json({ ok: true });
};

export const handleGetPublishProviderAvatar = async (
  providerKey: string,
  userId?: string
) => {
  const provider = getProviderDefinitionServer(providerKey);
  if (!provider) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  const resolved = await resolveUserId(userId);
  if ("error" in resolved) return resolved.error;

  const definition = getProviderDefinitionServer(provider.id);
  if (!definition?.getAvatar) {
    return NextResponse.json({ error: "Avatar not available" }, { status: 404 });
  }

  const avatar = await definition.getAvatar(resolved.userId);
  if (!avatar) {
    return NextResponse.json({ error: "Avatar not available" }, { status: 404 });
  }
  if ("error" in avatar) {
    const errorMessage = avatar.error ?? "Unable to fetch avatar";
    const status = avatar.status ?? 500;
    return NextResponse.json({ error: errorMessage }, { status });
  }

  return new NextResponse(avatar.buffer as BodyInit, {
    headers: {
      "Content-Type": avatar.contentType,
      "Cache-Control": "public, max-age=600",
    },
  });
};
