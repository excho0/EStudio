import type { Session } from "next-auth";

import { auth } from "@/auth";
import {
  getDrizzleDb,
  isPostgres,
  type PostgresDrizzleDb,
  type SqliteDrizzleDb,
} from "@/lib/drizzle/client";
import { schema, sqliteSchema } from "@/lib/drizzle/schema";
import { eq } from "drizzle-orm";

const getSessionEmail = (session: Session | null) =>
  session?.user?.email ?? null;

export const getSessionUser = async () => {
  const session = await auth();
  const userId = session?.user && "id" in session.user ? (session.user.id as string | undefined) : undefined;
  const email = getSessionEmail(session);
  if (!userId && !email) return null;
  const db = getDrizzleDb();
  if (isPostgres) {
    const [user] = await (db as PostgresDrizzleDb)
      .select()
      .from(schema.users)
      .where(userId ? eq(schema.users.id, userId) : eq(schema.users.email, email!))
      .limit(1);
    return user ?? null;
  }
  const [user] = await (db as SqliteDrizzleDb)
    .select()
    .from(sqliteSchema.users)
    .where(userId ? eq(sqliteSchema.users.id, userId) : eq(sqliteSchema.users.email, email!))
    .limit(1);
  return user ?? null;
};
