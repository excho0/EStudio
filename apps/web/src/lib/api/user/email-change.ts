import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import crypto from "crypto";

import type { Session } from "next-auth";
import { auth } from "@/auth";
import { sendEmailChangeVerification } from "@/lib/auth/email";
import { getDrizzleDb, isPostgres } from "@/lib/drizzle/client";
import { schema, sqliteSchema } from "@/lib/drizzle/schema";
import { eventBus } from "@/lib/event-bus";
import type { PostgresDrizzleDb, SqliteDrizzleDb } from "@/types";

const emailChangeSchema = z.object({
  email: z.string().trim().email().max(120),
});

const EMAIL_CHANGE_TOKEN_TYPE = "email_change";
const EMAIL_CHANGE_WINDOW_MS = 1000 * 60 * 60;

const getSessionEmail = (session: Session | null) =>
  session?.user?.email ?? null;

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

const fetchPendingEmailTokenByUser = async (userId: string) => {
  const db = getDrizzleDb();
  if (isPostgres) {
    const [token] = await (db as PostgresDrizzleDb)
      .select()
      .from(schema.appTokens)
      .where(
        and(
          eq(schema.appTokens.userId, userId),
          eq(schema.appTokens.type, EMAIL_CHANGE_TOKEN_TYPE)
        )
      )
      .orderBy(desc(schema.appTokens.createdAt))
      .limit(1);
    return token ?? null;
  }
  const [token] = await (db as SqliteDrizzleDb)
    .select()
    .from(sqliteSchema.appTokens)
    .where(
      and(
        eq(sqliteSchema.appTokens.userId, userId),
        eq(sqliteSchema.appTokens.type, EMAIL_CHANGE_TOKEN_TYPE)
      )
    )
    .orderBy(desc(sqliteSchema.appTokens.createdAt))
    .limit(1);
  return token ?? null;
};

const deleteEmailChangeTokens = async (userId: string) => {
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

const insertEmailChangeToken = async (userId: string, newEmail: string) => {
  const db = getDrizzleDb();
  const token = crypto.randomBytes(32).toString("hex");
  const payload = JSON.stringify({ newEmail });
  if (isPostgres) {
    const now = new Date();
    const expires = new Date(now.getTime() + EMAIL_CHANGE_WINDOW_MS);
    await (db as PostgresDrizzleDb).insert(schema.appTokens).values({
      token,
      userId,
      type: EMAIL_CHANGE_TOKEN_TYPE,
      payload,
      createdAt: now,
      expires,
    });
    return token;
  }
  const createdAt = new Date();
  const expires = new Date(createdAt.getTime() + EMAIL_CHANGE_WINDOW_MS);
  await (db as SqliteDrizzleDb).insert(sqliteSchema.appTokens).values({
    token,
    userId,
    type: EMAIL_CHANGE_TOKEN_TYPE,
    payload,
    createdAt,
    expires,
  });
  return token;
};

const getPendingEmail = async (userId: string) => {
  const pendingToken = await fetchPendingEmailTokenByUser(userId);
  if (!pendingToken) {
    return null;
  }

  const expiresAt = getExpiresMs(pendingToken.expires);
  if (!expiresAt || expiresAt <= Date.now()) {
    await deleteEmailChangeTokens(userId);
    return null;
  }

  const rawPayload = pendingToken.payload?.trim();
  if (!rawPayload) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawPayload) as { newEmail?: string };
    return parsed.newEmail ?? null;
  } catch {
    return null;
  }
};

export const handleRequestEmailChange = async (request: Request) => {
  const session = await auth();
  const sessionEmail = getSessionEmail(session);
  if (!sessionEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = emailChangeSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json({ error: payload.error.message }, { status: 400 });
  }

  const user = await fetchUserByEmail(sessionEmail);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const nextEmail = payload.data.email;
  if (nextEmail !== user.email) {
    const existing = await fetchUserByEmail(nextEmail);
    if (existing && existing.id !== user.id) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
  }

  if (nextEmail === user.email) {
    await deleteEmailChangeTokens(user.id);
    return NextResponse.json({
      name: user.name ?? "",
      email: user.email ?? "",
      image: user.image ?? null,
      pendingEmail: null,
    });
  }

  await deleteEmailChangeTokens(user.id);
  const token = await insertEmailChangeToken(user.id, nextEmail);
  const baseUrl = getRequestBaseUrl(request);

  try {
    await sendEmailChangeVerification({
      to: nextEmail,
      token,
      name: user.name ?? "",
      baseUrl,
    });
  } catch (error) {
    await deleteEmailChangeTokens(user.id);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to send verification email.",
      },
      { status: 500 }
    );
  }

  const pendingEmail = await getPendingEmail(user.id);
  const response = {
    name: user.name ?? "",
    email: user.email ?? "",
    image: user.image ?? null,
    pendingEmail,
  };

  void eventBus.emit("user.profile.updated", {
    userId: user.id,
    name: response.name,
    email: response.email,
    pendingEmail: response.pendingEmail,
  });

  return NextResponse.json(response);
};
