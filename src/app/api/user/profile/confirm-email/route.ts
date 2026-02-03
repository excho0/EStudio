import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { getDrizzleDb, isPostgres } from "@/lib/drizzle/client";
import type { PostgresDrizzleDb, SqliteDrizzleDb } from "@/types";
import { schema, sqliteSchema } from "@/lib/drizzle/schema";

export const runtime = "nodejs";

const EMAIL_CHANGE_TOKEN_TYPE = "email_change";

const getExpiresMs = (value: unknown) => {
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

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

const fetchToken = async (token: string) => {
  const db = getDrizzleDb();
  if (isPostgres) {
    const [row] = await (db as PostgresDrizzleDb)
      .select()
      .from(schema.appTokens)
      .where(eq(schema.appTokens.token, token))
      .limit(1);
    return row ?? null;
  }
  const [row] = await (db as SqliteDrizzleDb)
    .select()
    .from(sqliteSchema.appTokens)
    .where(eq(sqliteSchema.appTokens.token, token))
    .limit(1);
  return row ?? null;
};

const deleteTokensForUser = async (userId: string) => {
  const db = getDrizzleDb();
  if (isPostgres) {
    await (db as PostgresDrizzleDb)
      .delete(schema.appTokens)
      .where(
        and(
          eq(schema.appTokens.userId, userId),
          eq(schema.appTokens.type, EMAIL_CHANGE_TOKEN_TYPE)
        )
      );
    return;
  }
  await (db as SqliteDrizzleDb)
    .delete(sqliteSchema.appTokens)
    .where(
      and(
        eq(sqliteSchema.appTokens.userId, userId),
        eq(sqliteSchema.appTokens.type, EMAIL_CHANGE_TOKEN_TYPE)
      )
    );
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

const updateUserEmail = async (userId: string, email: string) => {
  const db = getDrizzleDb();
  if (isPostgres) {
    await (db as PostgresDrizzleDb)
      .update(schema.users)
      .set({ email, emailVerified: new Date() })
      .where(eq(schema.users.id, userId));
    return;
  }
  await (db as SqliteDrizzleDb)
    .update(sqliteSchema.users)
    .set({ email, emailVerified: new Date() })
    .where(eq(sqliteSchema.users.id, userId));
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const record = await fetchToken(token);
  if (!record || record.type !== EMAIL_CHANGE_TOKEN_TYPE) {
    return NextResponse.json({ error: "Invalid token" }, { status: 404 });
  }

  const expiresAt = getExpiresMs(record.expires);
  if (!expiresAt || expiresAt <= Date.now()) {
    await deleteTokensForUser(record.userId);
    return NextResponse.json({ error: "Token expired" }, { status: 410 });
  }

  let newEmail: string | undefined;
  const rawPayload = record.payload?.trim();
  if (rawPayload) {
    try {
      const parsed = JSON.parse(rawPayload) as { newEmail?: string };
      newEmail = parsed.newEmail;
    } catch {
      newEmail = undefined;
    }
  }

  if (!newEmail) {
    await deleteTokensForUser(record.userId);
    return NextResponse.json({ error: "Invalid token payload" }, { status: 400 });
  }

  const existing = await fetchUserByEmail(newEmail);
  if (existing && existing.id !== record.userId) {
    await deleteTokensForUser(record.userId);
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  await updateUserEmail(record.userId, newEmail);
  await deleteTokensForUser(record.userId);

  const redirectUrl = new URL(
    "/settings/profile?email=confirmed",
    getRequestBaseUrl(request)
  );
  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set("email-change-confirmed", "true", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 5,
  });
  return response;
}
