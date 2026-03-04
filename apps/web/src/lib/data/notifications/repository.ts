import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";
import {
  type NotificationItem,
  type NotificationKind,
  type NotificationStatus,
} from "@/types";
import { schema, sqliteSchema } from "@/lib/drizzle/schema";
import { withNotificationsDb } from "./db";
import type { NotificationsListQuery } from "./schemas";

type UpsertNotificationInput = {
  userId: string;
  key: string;
  contentId: string;
  mode?: string;
  kind: NotificationKind;
  status: NotificationStatus;
  progress?: number;
  stage?: string;
  error?: string;
  metadata?: Record<string, unknown> | null;
  updatedAt?: number;
};

const parseSqliteMetadata = (value: string | null) => {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const toUnixMs = (value?: Date | number | string | null) => {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

export async function listNotifications(userId: string, query: NotificationsListQuery) {
  const safeLimit = Math.min(Math.max(query.limit ?? 50, 1), 200);
  return withNotificationsDb({
    pg: async ({ db, table }) => {
      const whereClause = query.unreadOnly
        ? and(eq(table.userId, userId), isNull(table.readAt))
        : eq(table.userId, userId);
      const rows = await db
        .select()
        .from(table)
        .where(whereClause)
        .orderBy(desc(table.updatedAt))
        .limit(safeLimit);

      const items: NotificationItem[] = rows.map((row) => ({
        id: row.id,
        key: row.key,
        userId: row.userId,
        contentId: row.contentId,
        mode: row.mode ?? undefined,
        kind: row.kind as NotificationKind,
        status: row.status as NotificationStatus,
        progress: row.progress ?? undefined,
        stage: row.stage ?? undefined,
        error: row.error ?? undefined,
        metadata: (row.metadata ?? null) as Record<string, unknown> | null,
        readAt: toUnixMs(row.readAt),
        createdAt: toUnixMs(row.createdAt) ?? Date.now(),
        updatedAt: toUnixMs(row.updatedAt) ?? Date.now(),
      }));
      return { items };
    },
    sqlite: async ({ db, table }) => {
      const whereClause = query.unreadOnly
        ? and(eq(table.userId, userId), isNull(table.readAt))
        : eq(table.userId, userId);
      const rows = await db
        .select()
        .from(table)
        .where(whereClause)
        .orderBy(desc(table.updatedAt))
        .limit(safeLimit);
      const items: NotificationItem[] = rows.map((row) => ({
        id: row.id,
        key: row.key,
        userId: row.userId,
        contentId: row.contentId,
        mode: row.mode ?? undefined,
        kind: row.kind as NotificationKind,
        status: row.status as NotificationStatus,
        progress: row.progress ?? undefined,
        stage: row.stage ?? undefined,
        error: row.error ?? undefined,
        metadata: parseSqliteMetadata(row.metadata ?? null),
        readAt: toUnixMs(row.readAt),
        createdAt: toUnixMs(row.createdAt) ?? Date.now(),
        updatedAt: toUnixMs(row.updatedAt) ?? Date.now(),
      }));
      return { items };
    },
  });
}

export async function upsertNotificationByKey(input: UpsertNotificationInput) {
  return withNotificationsDb({
    pg: async ({ db, now, table }) => {
      const existing = await db
        .select({ id: table.id })
        .from(table)
        .where(and(eq(table.userId, input.userId), eq(table.key, input.key)))
        .limit(1);

      const updatedAtDate = new Date(input.updatedAt ?? now.getTime());
      if (existing[0]?.id) {
        await db
          .update(table)
          .set({
            contentId: input.contentId,
            mode: input.mode,
            kind: input.kind,
            status: input.status,
            progress: input.progress,
            stage: input.stage,
            error: input.error,
            metadata: input.metadata ?? null,
            updatedAt: updatedAtDate,
          })
          .where(eq(table.id, existing[0].id));
        return existing[0].id;
      }

      const values: InferInsertModel<typeof schema.notifications> = {
        id: crypto.randomUUID(),
        userId: input.userId,
        key: input.key,
        contentId: input.contentId,
        mode: input.mode,
        kind: input.kind,
        status: input.status,
        progress: input.progress,
        stage: input.stage,
        error: input.error,
        metadata: input.metadata ?? null,
        createdAt: updatedAtDate,
        updatedAt: updatedAtDate,
      };
      await db.insert(table).values(values);
      return values.id;
    },
    sqlite: async ({ db, nowMs, table }) => {
      const existing = await db
        .select({ id: table.id })
        .from(table)
        .where(and(eq(table.userId, input.userId), eq(table.key, input.key)))
        .limit(1);

      const updatedAt = input.updatedAt ?? nowMs;
      const updatedAtDate = new Date(updatedAt);
      if (existing[0]?.id) {
        await db
          .update(table)
          .set({
            contentId: input.contentId,
            mode: input.mode,
            kind: input.kind,
            status: input.status,
            progress: input.progress,
            stage: input.stage,
            error: input.error,
            metadata: input.metadata ? JSON.stringify(input.metadata) : null,
            updatedAt: updatedAtDate,
          })
          .where(eq(table.id, existing[0].id));
        return existing[0].id;
      }

      const values: InferInsertModel<typeof sqliteSchema.notifications> = {
        id: crypto.randomUUID(),
        userId: input.userId,
        key: input.key,
        contentId: input.contentId,
        mode: input.mode,
        kind: input.kind,
        status: input.status,
        progress: input.progress,
        stage: input.stage,
        error: input.error,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        createdAt: updatedAtDate,
        updatedAt: updatedAtDate,
      };
      await db.insert(table).values(values);
      return values.id;
    },
  });
}

export async function markNotificationsRead(userId: string, ids?: string[]) {
  return withNotificationsDb({
    pg: async ({ db, now, table }) => {
      const whereClause =
        ids && ids.length > 0
          ? and(eq(table.userId, userId), inArray(table.id, ids))
          : and(eq(table.userId, userId), isNull(table.readAt));
      const result = await db
        .update(table)
        .set({ readAt: now, updatedAt: now })
        .where(whereClause)
        .returning({ id: table.id });
      return result.length;
    },
    sqlite: async ({ db, nowMs, table }) => {
      const whereClause =
        ids && ids.length > 0
          ? and(eq(table.userId, userId), inArray(table.id, ids))
          : and(eq(table.userId, userId), isNull(table.readAt));
      const result = await db
        .update(table)
        .set({ readAt: new Date(nowMs), updatedAt: new Date(nowMs) })
        .where(whereClause)
        .returning({ id: table.id });
      return result.length;
    },
  });
}

export async function finalizeActiveRenderNotificationsForContent(
  userId: string,
  contentId: string
) {
  const activeStatuses: NotificationStatus[] = ["queued", "processing", "rendering"];
  return withNotificationsDb({
    pg: async ({ db, now, table }) => {
      const result = await db
        .update(table)
        .set({
          status: "canceled",
          progress: 1,
          stage: "Canceled",
          error: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(table.userId, userId),
            eq(table.kind, "render"),
            eq(table.contentId, contentId),
            inArray(table.status, activeStatuses)
          )
        )
        .returning({ id: table.id });
      return result.length;
    },
    sqlite: async ({ db, nowMs, table }) => {
      const result = await db
        .update(table)
        .set({
          status: "canceled",
          progress: 1,
          stage: "Canceled",
          error: null,
          updatedAt: new Date(nowMs),
        })
        .where(
          and(
            eq(table.userId, userId),
            eq(table.kind, "render"),
            eq(table.contentId, contentId),
            inArray(table.status, activeStatuses)
          )
        )
        .returning({ id: table.id });
      return result.length;
    },
  });
}

export async function recoverStaleJobActivities(staleBeforeMs: number) {
  const staleBefore = new Date(staleBeforeMs);
  const activeStatuses: NotificationStatus[] = [
    "queued",
    "processing",
    "publishing",
    "rendering",
  ];

  return withNotificationsDb({
    pg: async ({ db, now, table }) => {
      const result = await db
        .update(table)
        .set({
          status: "canceled",
          progress: 1,
          stage: "Recovered after worker restart",
          error: null,
          updatedAt: now,
        })
        .where(
          and(
            inArray(table.status, activeStatuses),
            lt(table.updatedAt, staleBefore)
          )
        )
        .returning({ id: table.id });
      return result.length;
    },
    sqlite: async ({ db, nowMs, table }) => {
      const result = await db
        .update(table)
        .set({
          status: "canceled",
          progress: 1,
          stage: "Recovered after worker restart",
          error: null,
          updatedAt: new Date(nowMs),
        })
        .where(
          and(
            inArray(table.status, activeStatuses),
            lt(table.updatedAt, staleBefore)
          )
        )
        .returning({ id: table.id });
      return result.length;
    },
  });
}


export type StaleJobActivityRecord = NotificationItem;

export async function listStaleJobActivities(staleBeforeMs: number, limit = 500) {
  const staleBefore = new Date(staleBeforeMs);
  const safeLimit = Math.min(Math.max(limit, 1), 2000);
  const activeStatuses: NotificationStatus[] = [
    "queued",
    "processing",
    "publishing",
    "rendering",
  ];

  return withNotificationsDb({
    pg: async ({ db, table }) => {
      const rows = await db
        .select()
        .from(table)
        .where(and(inArray(table.status, activeStatuses), lt(table.updatedAt, staleBefore)))
        .orderBy(table.updatedAt)
        .limit(safeLimit);

      return rows.map((row) => ({
        id: row.id,
        key: row.key,
        userId: row.userId,
        contentId: row.contentId,
        mode: row.mode ?? undefined,
        kind: row.kind as NotificationKind,
        status: row.status as NotificationStatus,
        progress: row.progress ?? undefined,
        stage: row.stage ?? undefined,
        error: row.error ?? undefined,
        metadata: (row.metadata ?? null) as Record<string, unknown> | null,
        readAt: toUnixMs(row.readAt),
        createdAt: toUnixMs(row.createdAt) ?? Date.now(),
        updatedAt: toUnixMs(row.updatedAt) ?? Date.now(),
      }));
    },
    sqlite: async ({ db, table }) => {
      const rows = await db
        .select()
        .from(table)
        .where(and(inArray(table.status, activeStatuses), lt(table.updatedAt, staleBefore)))
        .orderBy(table.updatedAt)
        .limit(safeLimit);

      return rows.map((row) => ({
        id: row.id,
        key: row.key,
        userId: row.userId,
        contentId: row.contentId,
        mode: row.mode ?? undefined,
        kind: row.kind as NotificationKind,
        status: row.status as NotificationStatus,
        progress: row.progress ?? undefined,
        stage: row.stage ?? undefined,
        error: row.error ?? undefined,
        metadata: parseSqliteMetadata(row.metadata ?? null),
        readAt: toUnixMs(row.readAt),
        createdAt: toUnixMs(row.createdAt) ?? Date.now(),
        updatedAt: toUnixMs(row.updatedAt) ?? Date.now(),
      }));
    },
  });
}

export async function updateJobActivityStateById(
  id: string,
  updates: {
    status: NotificationStatus;
    progress?: number;
    stage?: string | null;
    error?: string | null;
    updatedAt?: number;
  }
) {
  return withNotificationsDb({
    pg: async ({ db, now, table }) => {
      const updatedAtDate = new Date(updates.updatedAt ?? now.getTime());
      const result = await db
        .update(table)
        .set({
          status: updates.status,
          progress: updates.progress,
          stage: updates.stage ?? null,
          error: updates.error ?? null,
          updatedAt: updatedAtDate,
        })
        .where(eq(table.id, id))
        .returning({ id: table.id });
      return result.length > 0;
    },
    sqlite: async ({ db, nowMs, table }) => {
      const updatedAtDate = new Date(updates.updatedAt ?? nowMs);
      const result = await db
        .update(table)
        .set({
          status: updates.status,
          progress: updates.progress,
          stage: updates.stage ?? null,
          error: updates.error ?? null,
          updatedAt: updatedAtDate,
        })
        .where(eq(table.id, id))
        .returning({ id: table.id });
      return result.length > 0;
    },
  });
}


export async function listActiveJobActivities(limit = 500) {
  const safeLimit = Math.min(Math.max(limit, 1), 2000);
  const activeStatuses: NotificationStatus[] = [
    "queued",
    "processing",
    "publishing",
    "rendering",
  ];

  return withNotificationsDb({
    pg: async ({ db, table }) => {
      const rows = await db
        .select()
        .from(table)
        .where(inArray(table.status, activeStatuses))
        .orderBy(table.updatedAt)
        .limit(safeLimit);

      return rows.map((row) => ({
        id: row.id,
        key: row.key,
        userId: row.userId,
        contentId: row.contentId,
        mode: row.mode ?? undefined,
        kind: row.kind as NotificationKind,
        status: row.status as NotificationStatus,
        progress: row.progress ?? undefined,
        stage: row.stage ?? undefined,
        error: row.error ?? undefined,
        metadata: (row.metadata ?? null) as Record<string, unknown> | null,
        readAt: toUnixMs(row.readAt),
        createdAt: toUnixMs(row.createdAt) ?? Date.now(),
        updatedAt: toUnixMs(row.updatedAt) ?? Date.now(),
      }));
    },
    sqlite: async ({ db, table }) => {
      const rows = await db
        .select()
        .from(table)
        .where(inArray(table.status, activeStatuses))
        .orderBy(table.updatedAt)
        .limit(safeLimit);

      return rows.map((row) => ({
        id: row.id,
        key: row.key,
        userId: row.userId,
        contentId: row.contentId,
        mode: row.mode ?? undefined,
        kind: row.kind as NotificationKind,
        status: row.status as NotificationStatus,
        progress: row.progress ?? undefined,
        stage: row.stage ?? undefined,
        error: row.error ?? undefined,
        metadata: parseSqliteMetadata(row.metadata ?? null),
        readAt: toUnixMs(row.readAt),
        createdAt: toUnixMs(row.createdAt) ?? Date.now(),
        updatedAt: toUnixMs(row.updatedAt) ?? Date.now(),
      }));
    },
  });
}


// Backward-compatible aliases
export const updateNotificationStateById = updateJobActivityStateById;
export const listActiveNotifications = listActiveJobActivities;

export const listStaleActiveNotifications = listStaleJobActivities;
export const recoverStaleActiveNotifications = recoverStaleJobActivities;
export type StaleNotificationRecord = StaleJobActivityRecord;
