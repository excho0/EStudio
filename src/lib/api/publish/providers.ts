import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import type { Session } from "next-auth";

import { auth } from "@/auth";
import { getDrizzleDb, isPostgres } from "@/lib/drizzle/client";
import type { PostgresDrizzleDb, SqliteDrizzleDb } from "@/types";
import { schema, sqliteSchema } from "@/lib/drizzle/schema";
import { PROVIDER_REGISTRY } from "@/lib/publishing/providers";

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

const fetchProviderConnected = async (
  userId: string,
  providerId: string | undefined
) => {
  if (!providerId) return null;
  const db = getDrizzleDb();
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
          eq(schema.accounts.provider, providerId)
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
        eq(sqliteSchema.accounts.provider, providerId)
      )
    )
    .limit(1);
  return account ?? null;
};

export const handleGetPublishProviders = async () => {
  const session = await auth();
  const email = getSessionEmail(session);
  const user = email ? await fetchUserByEmail(email) : null;
  const providers = Object.values(PROVIDER_REGISTRY);
  const publishTargets = await Promise.all(
    providers.map(async (provider) => {
      const account = user
        ? await fetchProviderConnected(user.id, provider.oauthProviderId)
        : null;
      const connected = Boolean(account);
      return {
        id: provider.id,
        label: provider.label,
        status: connected ? "active" : "idle",
        connected,
        connectionId: account?.providerAccountId ?? null,
        capabilities: provider.capabilities,
      };
    })
  );

  return NextResponse.json({ publishTargets });
};
