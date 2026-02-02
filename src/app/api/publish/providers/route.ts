import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import type { Session } from "next-auth";

import { auth } from "@/auth";
import { getDrizzleDb, isPostgres, type PostgresDrizzleDb, type SqliteDrizzleDb } from "@/lib/drizzle/client";
import { schema, sqliteSchema } from "@/lib/drizzle/schema";
import { PROVIDER_REGISTRY } from "@/lib/publishing/providers";

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

const fetchYoutubeConnected = async (userId: string) => {
  const db = getDrizzleDb();
  if (isPostgres) {
    const [account] = await (db as PostgresDrizzleDb)
      .select({ provider: schema.accounts.provider })
      .from(schema.accounts)
      .where(
        and(
          eq(schema.accounts.userId, userId),
          eq(schema.accounts.provider, "google-youtube")
        )
      )
      .limit(1);
    return Boolean(account);
  }
  const [account] = await (db as SqliteDrizzleDb)
    .select({ provider: sqliteSchema.accounts.provider })
    .from(sqliteSchema.accounts)
    .where(
      and(
        eq(sqliteSchema.accounts.userId, userId),
        eq(sqliteSchema.accounts.provider, "google-youtube")
      )
    )
    .limit(1);
  return Boolean(account);
};

export async function GET() {
  const session = await auth();
  const email = getSessionEmail(session);
  const user = email ? await fetchUserByEmail(email) : null;
  const youtubeConnected = user ? await fetchYoutubeConnected(user.id) : false;

  const publishTargets = Object.values(PROVIDER_REGISTRY).map((provider) => {
    const isYoutube = provider.id === "youtube";
    const connected = isYoutube ? youtubeConnected : false;
    return {
      id: provider.id,
      label: provider.label,
      status: connected ? "active" : "idle",
      connected,
      capabilities: provider.capabilities,
    };
  });

  return NextResponse.json({ publishTargets });
}
