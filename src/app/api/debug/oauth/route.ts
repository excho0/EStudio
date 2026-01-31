import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import type { Session } from "next-auth";
import { auth } from "@/auth";
import {
  getDrizzleDb,
  type PostgresDrizzleDb,
  type SqliteDrizzleDb,
} from "@/lib/drizzle/client";
import { schema, sqliteSchema } from "@/lib/drizzle/schema";

export const runtime = "nodejs";

const resolveIsPostgres = () => {
  const driver = process.env.DB_DRIVER?.toLowerCase();
  if (driver === "sqlite") return false;
  if (driver === "postgres") return true;
  if (process.env.SQLITE_URL) return false;
  return Boolean(process.env.POSTGRES_URL ?? process.env.DATABASE_URL);
};

const isPostgres = resolveIsPostgres();

const getSessionEmail = (session: Session | null) =>
  session?.user?.email ?? null;

export async function GET() {
  const session = await auth();
  const email = getSessionEmail(session);
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDrizzleDb();
  const user = isPostgres
    ? await (db as PostgresDrizzleDb)
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, email))
        .limit(1)
    : await (db as SqliteDrizzleDb)
        .select({ id: sqliteSchema.users.id })
        .from(sqliteSchema.users)
        .where(eq(sqliteSchema.users.email, email))
        .limit(1);

  const userId = user[0]?.id;
  if (!userId) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  let accounts: { provider: string | null; scope?: string | null; expires_at?: number | null; refresh_token?: string | null; access_token?: string | null }[] = [];

  if (isPostgres) {
    const rows = await (db as PostgresDrizzleDb)
      .select({
        provider: schema.accounts.provider,
        scope: schema.accounts.scope,
        expires_at: schema.accounts.expires_at,
        refresh_token: schema.accounts.refresh_token,
        access_token: schema.accounts.access_token,
      })
      .from(schema.accounts)
      .where(eq(schema.accounts.userId, userId));
    accounts = rows;
  } else {
    const rows = await (db as SqliteDrizzleDb)
      .select({
        provider: sqliteSchema.accounts.provider,
        scope: sqliteSchema.accounts.scope,
        expires_at: sqliteSchema.accounts.expires_at,
        refresh_token: sqliteSchema.accounts.refresh_token,
        access_token: sqliteSchema.accounts.access_token,
      })
      .from(sqliteSchema.accounts)
      .where(eq(sqliteSchema.accounts.userId, userId));
    accounts = rows;
  }

  const sanitized = accounts.map((account) => ({
    provider: account.provider,
    scope: account.scope ?? null,
    expires_at: account.expires_at ?? null,
    has_refresh_token: Boolean(account.refresh_token),
    has_access_token: Boolean(account.access_token),
  }));

  return NextResponse.json({ accounts: sanitized });
}
