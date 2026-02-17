import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  inArray,
  like,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { InferInsertModel, SQL } from "drizzle-orm";
import { z } from "zod";

import { schema, sqliteSchema } from "@/lib/drizzle/schema";

import { normalizeContentRow, serializeColorPalette } from "./codec";
import { withContentDb } from "./db";
import {
  contentCreateSchema,
  contentQuerySchema,
  contentUpdateSchema,
} from "./schemas";

const ALLOWED_STATUS_TRANSITIONS: Record<
  "uploaded" | "rendering" | "rendered" | "failed",
  ReadonlyArray<"uploaded" | "rendering" | "rendered" | "failed">
> = {
  uploaded: ["uploaded", "rendering", "rendered", "failed"],
  rendering: ["uploaded", "rendering", "rendered", "failed"],
  rendered: ["rendered", "rendering", "failed"],
  failed: ["failed", "rendering", "rendered"],
};

export async function listContentItems(
  userId: string,
  query: z.infer<typeof contentQuerySchema>
) {
  const safe = contentQuerySchema.parse(query);
  const offset = (safe.page - 1) * safe.limit;
  const term = safe.q.toLowerCase();
  const sortColumn =
    safe.sortBy === "updatedAt"
      ? "updatedAt"
      : safe.sortBy === "title"
        ? "title"
        : safe.sortBy === "status"
          ? "status"
          : "createdAt";

  return withContentDb({
    pg: async ({ db, table }) => {
      const filters = term
        ? or(
            like(sql`lower(${table.title})`, `%${term}%`),
            like(sql`lower(${table.status})`, `%${term}%`),
            like(sql`lower(${table.id})`, `%${term}%`)
          )
        : undefined;
      const scopedFilters = [
        eq(table.userId, userId),
        safe.status ? eq(table.status, safe.status) : undefined,
        filters,
      ].filter(Boolean) as Array<SQL>;
      const whereClause = scopedFilters.length ? and(...scopedFilters) : undefined;

      const sortColumnMap = {
        createdAt: table.createdAt,
        updatedAt: table.updatedAt,
        title: table.title,
        status: table.status,
      } as const;
      const orderColumn = sortColumnMap[sortColumn];
      const orderBy = safe.sortDir === "asc" ? asc(orderColumn) : desc(orderColumn);
      const columns = getTableColumns(table);

      const rows = await db
        .select({
          ...columns,
        })
        .from(table)
        .where(whereClause ?? sql`true`)
        .orderBy(orderBy)
        .limit(safe.limit)
        .offset(offset);

      const contentIds = rows.map((row) => row.id).filter(Boolean);
      const publishCountRows = contentIds.length
        ? await db
            .select({
              contentId: schema.publishes.contentId,
              count: sql<number>`count(*)`,
            })
            .from(schema.publishes)
            .where(
              and(
                eq(schema.publishes.userId, userId),
                inArray(schema.publishes.contentId, contentIds)
              )
            )
            .groupBy(schema.publishes.contentId)
        : [];
      const publishCountMap = new Map(
        publishCountRows.map((row) => [row.contentId, Number(row.count) || 0])
      );

      const totalRow = await db
        .select({ count: sql<number>`count(*)` })
        .from(table)
        .where(whereClause ?? sql`true`);

      return {
        items: rows.map((row) =>
          normalizeContentRow({
            ...row,
            publishesCount: publishCountMap.get(row.id) ?? 0,
          })
        ),
        total: Number(totalRow[0]?.count ?? 0),
        page: safe.page,
        limit: safe.limit,
      };
    },
    sqlite: async ({ db, table }) => {
      const filters = term
        ? or(
            like(sql`lower(${table.title})`, `%${term}%`),
            like(sql`lower(${table.status})`, `%${term}%`),
            like(sql`lower(${table.id})`, `%${term}%`)
          )
        : undefined;
      const scopedFilters = [
        eq(table.userId, userId),
        safe.status ? eq(table.status, safe.status) : undefined,
        filters,
      ].filter(Boolean) as Array<SQL>;
      const whereClause = scopedFilters.length ? and(...scopedFilters) : undefined;

      const sortColumnMap = {
        createdAt: table.createdAt,
        updatedAt: table.updatedAt,
        title: table.title,
        status: table.status,
      } as const;
      const orderColumn = sortColumnMap[sortColumn];
      const orderBy = safe.sortDir === "asc" ? asc(orderColumn) : desc(orderColumn);
      const columns = getTableColumns(table);

      const rows = await db
        .select({
          ...columns,
        })
        .from(table)
        .where(whereClause ?? sql`true`)
        .orderBy(orderBy)
        .limit(safe.limit)
        .offset(offset);

      const contentIds = rows.map((row) => row.id).filter(Boolean);
      const publishCountRows = contentIds.length
        ? await db
            .select({
              contentId: sqliteSchema.publishes.contentId,
              count: sql<number>`count(*)`,
            })
            .from(sqliteSchema.publishes)
            .where(
              and(
                eq(sqliteSchema.publishes.userId, userId),
                inArray(sqliteSchema.publishes.contentId, contentIds)
              )
            )
            .groupBy(sqliteSchema.publishes.contentId)
        : [];
      const publishCountMap = new Map(
        publishCountRows.map((row) => [row.contentId, Number(row.count) || 0])
      );

      const totalRow = await db
        .select({ count: sql<number>`count(*)` })
        .from(table)
        .where(whereClause ?? sql`true`);

      return {
        items: rows.map((row) =>
          normalizeContentRow({
            ...row,
            publishesCount: publishCountMap.get(row.id) ?? 0,
          })
        ),
        total: Number(totalRow[0]?.count ?? 0),
        page: safe.page,
        limit: safe.limit,
      };
    },
  });
}

export async function failStaleRenderingItems(
  userId: string,
  options?: {
    activeIds?: string[];
    staleBefore?: Date;
  }
): Promise<string[]> {
  const activeIds = (options?.activeIds ?? []).filter(Boolean);
  const staleBefore = options?.staleBefore ?? new Date(Date.now() - 2 * 60 * 1000);
  const recoveredIds: string[] = [];

  await withContentDb({
    pg: async ({ db, table }) => {
      const whereParts: Array<SQL> = [
        eq(table.userId, userId),
        eq(table.status, "rendering"),
        sql`${table.updatedAt} <= ${staleBefore}`,
      ];
      if (activeIds.length > 0) {
        whereParts.push(notInArray(table.id, activeIds));
      }
      const staleRows = await db
        .select({ id: table.id })
        .from(table)
        .where(and(...whereParts));
      const staleIds = staleRows.map((row) => row.id);
      if (staleIds.length === 0) return;
      recoveredIds.push(...staleIds);
      await db
        .update(table)
        .set({ status: "failed", updatedAt: new Date() })
        .where(and(eq(table.userId, userId), inArray(table.id, staleIds)));
    },
    sqlite: async ({ db, table, now }) => {
      const whereParts: Array<SQL> = [
        eq(table.userId, userId),
        eq(table.status, "rendering"),
        sql`${table.updatedAt} <= ${staleBefore.toISOString()}`,
      ];
      if (activeIds.length > 0) {
        whereParts.push(notInArray(table.id, activeIds));
      }
      const staleRows = await db
        .select({ id: table.id })
        .from(table)
        .where(and(...whereParts));
      const staleIds = staleRows.map((row) => row.id);
      if (staleIds.length === 0) return;
      recoveredIds.push(...staleIds);
      await db
        .update(table)
        .set({ status: "failed", updatedAt: now })
        .where(and(eq(table.userId, userId), inArray(table.id, staleIds)));
    },
  });

  return recoveredIds;
}

export async function getContentStats(userId: string) {
  return withContentDb({
    pg: async ({ db, table }) => {
      const rows = await db
        .select({
          total: sql<number>`count(*)`,
          uploaded: sql<number>`sum(case when ${table.status} = 'uploaded' then 1 else 0 end)`,
          rendering: sql<number>`sum(case when ${table.status} = 'rendering' then 1 else 0 end)`,
          rendered: sql<number>`sum(case when ${table.status} = 'rendered' then 1 else 0 end)`,
          failed: sql<number>`sum(case when ${table.status} = 'failed' then 1 else 0 end)`,
        })
        .from(table)
        .where(eq(table.userId, userId));
      const row = rows[0] ?? {};
      return {
        total: Number(row.total ?? 0),
        uploaded: Number(row.uploaded ?? 0),
        rendering: Number(row.rendering ?? 0),
        rendered: Number(row.rendered ?? 0),
        failed: Number(row.failed ?? 0),
      };
    },
    sqlite: async ({ db, table }) => {
      const rows = await db
        .select({
          total: sql<number>`count(*)`,
          uploaded: sql<number>`sum(case when ${table.status} = 'uploaded' then 1 else 0 end)`,
          rendering: sql<number>`sum(case when ${table.status} = 'rendering' then 1 else 0 end)`,
          rendered: sql<number>`sum(case when ${table.status} = 'rendered' then 1 else 0 end)`,
          failed: sql<number>`sum(case when ${table.status} = 'failed' then 1 else 0 end)`,
        })
        .from(table)
        .where(eq(table.userId, userId));
      const row = rows[0] ?? {};
      return {
        total: Number(row.total ?? 0),
        uploaded: Number(row.uploaded ?? 0),
        rendering: Number(row.rendering ?? 0),
        rendered: Number(row.rendered ?? 0),
        failed: Number(row.failed ?? 0),
      };
    },
  });
}

export async function getContentItem(userId: string, id: string) {
  return withContentDb({
    pg: async ({ db, table }) => {
      const rows = await db
        .select()
        .from(table)
        .where(and(eq(table.id, id), eq(table.userId, userId)))
        .limit(1);
      return rows[0] ? normalizeContentRow(rows[0]) : null;
    },
    sqlite: async ({ db, table }) => {
      const rows = await db
        .select()
        .from(table)
        .where(and(eq(table.id, id), eq(table.userId, userId)))
        .limit(1);
      return rows[0] ? normalizeContentRow(rows[0]) : null;
    },
  });
}

export async function getContentItemById(id: string) {
  return withContentDb({
    pg: async ({ db, table }) => {
      const rows = await db.select().from(table).where(eq(table.id, id)).limit(1);
      return rows[0] ? normalizeContentRow(rows[0]) : null;
    },
    sqlite: async ({ db, table }) => {
      const rows = await db.select().from(table).where(eq(table.id, id)).limit(1);
      return rows[0] ? normalizeContentRow(rows[0]) : null;
    },
  });
}

export async function createContentItem(input: z.infer<typeof contentCreateSchema>) {
  const data = contentCreateSchema.parse(input);

  await withContentDb({
    pg: async ({ db, table }) => {
      const values: InferInsertModel<typeof schema.contentItems> = {
        ...data,
        colorPalette: serializeColorPalette(data.colorPalette),
      };
      await db.insert(table).values(values);
    },
    sqlite: async ({ db, table, now }) => {
      const values: InferInsertModel<typeof sqliteSchema.contentItems> = {
        ...data,
        colorPalette: serializeColorPalette(data.colorPalette),
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(table).values(values);
    },
  });

  return getContentItem(data.userId, data.id);
}

export async function updateContentItem(
  userId: string,
  id: string,
  updates: z.infer<typeof contentUpdateSchema>
) {
  const data = contentUpdateSchema.parse(updates);
  const cleaned = Object.fromEntries(
    Object.entries(data).filter(([, value]) => {
      if (value === undefined) return false;
      if (value === null) return false;
      return true;
    })
  ) as typeof data;

  if (Object.keys(cleaned).length === 0) {
    return getContentItem(userId, id);
  }

  if (cleaned.status) {
    const current = await getContentItem(userId, id);
    if (!current) {
      return null;
    }
    const fromStatus = current.status;
    const toStatus = cleaned.status;
    if (!ALLOWED_STATUS_TRANSITIONS[fromStatus].includes(toStatus)) {
      throw new Error(`Invalid content status transition: ${fromStatus} -> ${toStatus}`);
    }
  }

  await withContentDb({
    pg: async ({ db, table, now }) => {
      const { colorPalette, ...rest } = cleaned;
      const values: Partial<InferInsertModel<typeof schema.contentItems>> = {
        ...rest,
        updatedAt: now,
      };
      if (colorPalette !== undefined) {
        values.colorPalette = serializeColorPalette(colorPalette);
      }
      await db
        .update(table)
        .set(values)
        .where(and(eq(table.id, id), eq(table.userId, userId)));
    },
    sqlite: async ({ db, table, now }) => {
      const { colorPalette, ...rest } = cleaned;
      const values: Partial<InferInsertModel<typeof sqliteSchema.contentItems>> = {
        ...rest,
        updatedAt: now,
      };
      if (colorPalette !== undefined) {
        values.colorPalette = serializeColorPalette(colorPalette);
      }
      await db
        .update(table)
        .set(values)
        .where(and(eq(table.id, id), eq(table.userId, userId)));
    },
  });

  return getContentItem(userId, id);
}

export async function deleteContentItem(userId: string, id: string) {
  await withContentDb({
    pg: async ({ db, table }) => {
      await db.delete(table).where(and(eq(table.id, id), eq(table.userId, userId)));
    },
    sqlite: async ({ db, table }) => {
      await db.delete(table).where(and(eq(table.id, id), eq(table.userId, userId)));
    },
  });
}
