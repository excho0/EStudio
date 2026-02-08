import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import crypto from "crypto";

import type { Session } from "next-auth";
import { auth } from "@/auth";
import { getDrizzleDb, isPostgres } from "@/lib/drizzle/client";
import type { PostgresDrizzleDb, SqliteDrizzleDb } from "@/types";
import { schema, sqliteSchema } from "@/lib/drizzle/schema";
import { sendEmailChangeVerification } from "@/lib/auth/email";

export const runtime = "nodejs";


const profileSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(120),
});

const EMAIL_CHANGE_TOKEN_TYPE = "email_change";
const EMAIL_CHANGE_WINDOW_MS = 1000 * 60 * 60;

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

const fetchUserById = async (id: string) => {
  const db = getDrizzleDb();
  if (isPostgres) {
    const [user] = await (db as PostgresDrizzleDb)
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);
    return user ?? null;
  }
  const [user] = await (db as SqliteDrizzleDb)
    .select()
    .from(sqliteSchema.users)
    .where(eq(sqliteSchema.users.id, id))
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

const updateUser = async (
  id: string,
  payload: z.infer<typeof profileSchema>,
  resetEmailVerified: boolean
) => {
  const db = getDrizzleDb();
  const updatePayload = resetEmailVerified
    ? {
        name: payload.name,
        email: payload.email,
        emailVerified: null,
      }
    : {
        name: payload.name,
        email: payload.email,
      };
  if (isPostgres) {
    await (db as PostgresDrizzleDb)
      .update(schema.users)
      .set(updatePayload)
      .where(eq(schema.users.id, id));
    return fetchUserById(id);
  }
  await (db as SqliteDrizzleDb)
    .update(sqliteSchema.users)
    .set(updatePayload)
    .where(eq(sqliteSchema.users.id, id));
  return fetchUserById(id);
};

const updateUserName = async (id: string, name: string) => {
  const db = getDrizzleDb();
  if (isPostgres) {
    await (db as PostgresDrizzleDb)
      .update(schema.users)
      .set({ name })
      .where(eq(schema.users.id, id));
    return fetchUserById(id);
  }
  await (db as SqliteDrizzleDb)
    .update(sqliteSchema.users)
    .set({ name })
    .where(eq(sqliteSchema.users.id, id));
  return fetchUserById(id);
};

export async function GET() {
  const session = await auth();
  const email = getSessionEmail(session);
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await fetchUserByEmail(email);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const pendingToken = await fetchPendingEmailTokenByUser(user.id);
  let pendingEmail: string | null = null;
  if (pendingToken) {
    const expiresAt = getExpiresMs(pendingToken.expires);
    if (expiresAt && expiresAt > Date.now()) {
      const rawPayload = pendingToken.payload?.trim();
      if (rawPayload) {
        try {
          const parsed = JSON.parse(rawPayload) as { newEmail?: string };
          pendingEmail = parsed.newEmail ?? null;
        } catch {
          pendingEmail = null;
        }
      }
    } else {
      await deleteEmailChangeTokens(user.id);
    }
  }

  return NextResponse.json({
    id: user.id,
    name: user.name ?? "",
    email: user.email ?? "",
    image: user.image ?? null,
    pendingEmail,
  });
}

export async function PUT(request: Request) {
  const session = await auth();
  const email = getSessionEmail(session);
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = profileSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json({ error: payload.error.message }, { status: 400 });
  }

  const user = await fetchUserByEmail(email);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (payload.data.email !== user.email) {
    const existing = await fetchUserByEmail(payload.data.email);
    if (existing && existing.id !== user.id) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
  }

  const shouldChangeEmail = payload.data.email !== user.email;
  const updated = shouldChangeEmail
    ? await updateUserName(user.id, payload.data.name)
    : await updateUser(user.id, payload.data, false);
  if (!updated) {
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }

  let pendingEmail: string | null = null;
  if (shouldChangeEmail) {
    await deleteEmailChangeTokens(user.id);
    const token = await insertEmailChangeToken(user.id, payload.data.email);
    pendingEmail = payload.data.email;
    const baseUrl = getRequestBaseUrl(request);
    try {
      await sendEmailChangeVerification({
        to: payload.data.email,
        token,
        name: payload.data.name,
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
  }

  return NextResponse.json({
    name: updated.name ?? "",
    email: updated.email ?? "",
    image: updated.image ?? null,
    pendingEmail,
  });
}
