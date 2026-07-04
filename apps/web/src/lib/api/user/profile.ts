import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";

import type { Session } from "next-auth";
import { auth } from "@/auth";
import { getDrizzleDb, isPostgres } from "@/lib/drizzle/client";
import type { PostgresDrizzleDb, SqliteDrizzleDb } from "@/types";
import { schema, sqliteSchema } from "@/lib/drizzle/schema";
import { eventBus } from "@/lib/event-bus";

const profileSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

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

const getResolvedProfileResponse = async (userId: string) => {
  const user = await fetchUserById(userId);
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
};

export const handleGetProfile = async (userId?: string) => {
  let resolvedUserId = userId ?? null;
  if (!resolvedUserId) {
    const session = await auth();
    const email = getSessionEmail(session);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = await fetchUserByEmail(email);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    resolvedUserId = user.id;
  }
  return getResolvedProfileResponse(resolvedUserId);
};

export const handleUpdateProfile = async (request: Request, userId?: string) => {
  let resolvedUserId = userId ?? null;
  if (!resolvedUserId) {
  const session = await auth();
  const email = getSessionEmail(session);
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
    const user = await fetchUserByEmail(email);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    resolvedUserId = user.id;
  }

  const payload = profileSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json({ error: payload.error.message }, { status: 400 });
  }

  const user = await fetchUserById(resolvedUserId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const updated = await updateUserName(user.id, payload.data.name);
  if (!updated) {
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
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

  const response = {
    name: updated.name ?? "",
    email: updated.email ?? "",
    image: updated.image ?? null,
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
