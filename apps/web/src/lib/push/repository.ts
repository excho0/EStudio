import { and, eq, isNull } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";
import { getDrizzleDb, isPostgres, type PostgresDrizzleDb, type SqliteDrizzleDb } from "@/lib/drizzle/client";
import { schema, sqliteSchema } from "@/lib/drizzle/schema";
import type { PushSubscriptionInput, PushSubscriptionRecord } from "./schemas";

const toUnixMs = (value?: Date | number | string | null) => {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

const mapSqliteRecord = (
  row: typeof sqliteSchema.pushSubscriptions.$inferSelect,
): PushSubscriptionRecord => ({
  id: row.id,
  userId: row.userId,
  endpoint: row.endpoint,
  expirationTime: toUnixMs(row.expirationTime),
  keys: {
    p256dh: row.p256dh,
    auth: row.auth,
  },
  userAgent: row.userAgent ?? null,
  lastSeenAt: toUnixMs(row.lastSeenAt) ?? Date.now(),
  disabledAt: toUnixMs(row.disabledAt),
  createdAt: toUnixMs(row.createdAt) ?? Date.now(),
  updatedAt: toUnixMs(row.updatedAt) ?? Date.now(),
});

const mapPgRecord = (
  row: typeof schema.pushSubscriptions.$inferSelect,
): PushSubscriptionRecord => ({
  id: row.id,
  userId: row.userId,
  endpoint: row.endpoint,
  expirationTime: toUnixMs(row.expirationTime),
  keys: {
    p256dh: row.p256dh,
    auth: row.auth,
  },
  userAgent: row.userAgent ?? null,
  lastSeenAt: toUnixMs(row.lastSeenAt) ?? Date.now(),
  disabledAt: toUnixMs(row.disabledAt),
  createdAt: toUnixMs(row.createdAt) ?? Date.now(),
  updatedAt: toUnixMs(row.updatedAt) ?? Date.now(),
});

export async function upsertPushSubscription(
  userId: string,
  input: PushSubscriptionInput,
): Promise<PushSubscriptionRecord> {
  const now = new Date();
  const nowMs = now.getTime();
  const db = getDrizzleDb();

  if (isPostgres) {
    const pg = db as PostgresDrizzleDb;
    const table = schema.pushSubscriptions;
    const existing = await pg
      .select()
      .from(table)
      .where(eq(table.endpoint, input.endpoint))
      .limit(1);
    if (existing[0]) {
      await pg
        .update(table)
        .set({
          userId,
          expirationTime:
            input.expirationTime != null ? new Date(input.expirationTime) : null,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          userAgent: input.userAgent ?? null,
          lastSeenAt: now,
          disabledAt: null,
          updatedAt: now,
        })
        .where(eq(table.id, existing[0].id));
      const updated = await pg.select().from(table).where(eq(table.id, existing[0].id)).limit(1);
      return mapPgRecord(updated[0]!);
    }

    const values: InferInsertModel<typeof schema.pushSubscriptions> = {
      id: crypto.randomUUID(),
      userId,
      endpoint: input.endpoint,
      expirationTime:
        input.expirationTime != null ? new Date(input.expirationTime) : null,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: input.userAgent ?? null,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    };
    await pg.insert(table).values(values);
    return mapPgRecord(values as typeof schema.pushSubscriptions.$inferSelect);
  }

  const sqlite = db as SqliteDrizzleDb;
  const table = sqliteSchema.pushSubscriptions;
  const existing = await sqlite
    .select()
    .from(table)
    .where(eq(table.endpoint, input.endpoint))
    .limit(1);
  if (existing[0]) {
    await sqlite
      .update(table)
      .set({
        userId,
        expirationTime:
          input.expirationTime != null ? new Date(input.expirationTime) : null,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: input.userAgent ?? null,
        lastSeenAt: new Date(nowMs),
        disabledAt: null,
        updatedAt: new Date(nowMs),
      })
      .where(eq(table.id, existing[0].id));
    const updated = await sqlite.select().from(table).where(eq(table.id, existing[0].id)).limit(1);
    return mapSqliteRecord(updated[0]!);
  }

  const values: InferInsertModel<typeof sqliteSchema.pushSubscriptions> = {
    id: crypto.randomUUID(),
    userId,
    endpoint: input.endpoint,
    expirationTime:
      input.expirationTime != null ? new Date(input.expirationTime) : null,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    userAgent: input.userAgent ?? null,
    lastSeenAt: new Date(nowMs),
    createdAt: new Date(nowMs),
    updatedAt: new Date(nowMs),
  };
  await sqlite.insert(table).values(values);
  return mapSqliteRecord(values as typeof sqliteSchema.pushSubscriptions.$inferSelect);
}

export async function disablePushSubscriptionByEndpoint(endpoint: string) {
  const now = new Date();
  const db = getDrizzleDb();

  if (isPostgres) {
    const pg = db as PostgresDrizzleDb;
    const table = schema.pushSubscriptions;
    await pg
      .update(table)
      .set({ disabledAt: now, updatedAt: now })
      .where(eq(table.endpoint, endpoint));
    return;
  }

  const sqlite = db as SqliteDrizzleDb;
  const table = sqliteSchema.pushSubscriptions;
  await sqlite
    .update(table)
    .set({ disabledAt: now, updatedAt: now })
    .where(eq(table.endpoint, endpoint));
}

export async function listActivePushSubscriptions(userId: string) {
  const db = getDrizzleDb();

  if (isPostgres) {
    const pg = db as PostgresDrizzleDb;
    const table = schema.pushSubscriptions;
    const rows = await pg
      .select()
      .from(table)
      .where(and(eq(table.userId, userId), isNull(table.disabledAt)));
    return rows.map(mapPgRecord);
  }

  const sqlite = db as SqliteDrizzleDb;
  const table = sqliteSchema.pushSubscriptions;
  const rows = await sqlite
    .select()
    .from(table)
    .where(and(eq(table.userId, userId), isNull(table.disabledAt)));
  return rows.map(mapSqliteRecord);
}
