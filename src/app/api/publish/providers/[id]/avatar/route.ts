import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import type { Session } from "next-auth";

import { auth } from "@/auth";
import {
  getDrizzleDb,
  isPostgres,
  type PostgresDrizzleDb,
  type SqliteDrizzleDb,
} from "@/lib/drizzle/client";
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

const resolveProviderAvatar = async (providerId: string, userId: string) => {
  const definition = getProviderDefinitionServer(providerId);
  if (!definition?.getAvatar) return null;
  return definition.getAvatar(userId);
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

  const avatar = await resolveProviderAvatar(provider.id, user.id);
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
}
