import { and, asc, desc, eq, getTableColumns, inArray, like, or, sql } from "drizzle-orm";
import type { InferInsertModel, SQL } from "drizzle-orm";
import { z } from "zod";

import {
  getDrizzleDb,
  isPostgres,
  type PostgresDrizzleDb,
  type SqliteDrizzleDb,
} from "@/lib/drizzle/client";
import { schema, sqliteSchema } from "@/lib/drizzle/schema";
import { ContentItem } from "@/types";

const getDb = () => getDrizzleDb();

type PgContext = {
  db: PostgresDrizzleDb;
  table: typeof schema.contentItems;
  now: Date;
};

type SqliteContext = {
  db: SqliteDrizzleDb;
  table: typeof sqliteSchema.contentItems;
  now: string;
};

const withContentDb = async <T>(handlers: {
  pg: (ctx: PgContext) => Promise<T>;
  sqlite: (ctx: SqliteContext) => Promise<T>;
}) => {
  const db = getDb();
  if (isPostgres) {
    return handlers.pg({
      db: db as PostgresDrizzleDb,
      table: schema.contentItems,
      now: new Date(),
    });
  }
  return handlers.sqlite({
    db: db as SqliteDrizzleDb,
    table: sqliteSchema.contentItems,
    now: new Date().toISOString(),
  });
};

export const contentItemSchema = z.object({
  id: z.uuid(),
  userId: z.string().min(1),
  title: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  colorPalette: z.array(z.string()).optional().nullable(),
  paletteMode: z.enum(["auto", "manual"]).default("auto"),
  mode: z.string().default("video_loop"),
  settings: z.record(z.string(), z.unknown()).optional().nullable(),
  status: z.enum(["uploaded", "rendering", "rendered", "failed"]),
  songDurationSeconds: z.number().nonnegative(),
  fps: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  publishesCount: z.number().int().nonnegative().optional(),
});


export const contentQuerySchema = z.object({
  q: z.string().trim().optional().default(""),
  status: z.enum(["uploaded", "rendering", "rendered", "failed"]).optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "title", "status"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export const contentCreateSchema = z.object({
  id: z.uuid(),
  userId: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(["uploaded", "rendering", "rendered", "failed"]).default("uploaded"),
  colorPalette: z.array(z.string()).optional().nullable(),
  paletteMode: z.enum(["auto", "manual"]).default("auto"),
  mode: z.string().default("video_loop"),
  settings: z.record(z.string(), z.unknown()).optional().nullable(),
  songDurationSeconds: z.number().nonnegative().default(0),
  fps: z.number().int().positive().default(30),
  width: z.number().int().positive().default(1280),
  height: z.number().int().positive().default(720),
});

export const contentUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  status: z.enum(["uploaded", "rendering", "rendered", "failed"]).optional(),
  colorPalette: z.array(z.string()).optional().nullable(),
  paletteMode: z.enum(["auto", "manual"]).optional(),
  mode: z.string().optional(),
  settings: z.record(z.string(), z.unknown()).optional().nullable(),
  songDurationSeconds: z.number().nonnegative().optional(),
  fps: z.number().int().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export const contentCreateFormSchema = z.object({
  title: z.string().default("Untitled"),
  mode: z.string().default("video_loop"),
  settings: z.string().optional(),
  songDurationSeconds: z.coerce.number().nonnegative().default(0),
  fps: z.coerce.number().int().positive().default(30),
  width: z.coerce.number().int().positive().default(1280),
  height: z.coerce.number().int().positive().default(720),
});

export const contentUpdateFormSchema = z.object({
  title: z.string().optional(),
  status: z.string().optional(),
  paletteMode: z.enum(["auto", "manual"]).optional(),
  fps: z.coerce.number().int().positive().optional(),
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional(),
  mode: z.string().optional(),
  settings: z.string().optional(),
});

export const parseContentSettingsString = (value?: string | null) => {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const parseColorPalette = (value: unknown) => {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry));
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : null;
    } catch {
      return null;
    }
  }
  return null;
};

const serializeColorPalette = (value?: string[] | null) =>
  value && value.length > 0 ? JSON.stringify(value) : null;

const normalizeRow = (row: unknown): ContentItem => {
  const record = row as Record<string, unknown>;
  const toIso = (value: unknown) =>
    value instanceof Date ? value.toISOString() : value;
  const parsed = contentItemSchema.safeParse({
    ...record,
    createdAt: toIso(record.createdAt),
    updatedAt: toIso(record.updatedAt),
    colorPalette: parseColorPalette(record.colorPalette),
    paletteMode: record.paletteMode ?? "auto",
    mode: record.mode ?? "video_loop",
    settings: record.settings ?? null,
    fps: record.fps ?? 30,
    width: record.width ?? 1280,
    height: record.height ?? 720,
    publishesCount: Number.isFinite(Number(record.publishesCount))
      ? Number(record.publishesCount)
      : 0,
  });
  if (!parsed.success) {
    throw new Error(`Invalid content row: ${parsed.error.message}`);
  }
  return parsed.data;
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
      const orderBy =
        safe.sortDir === "asc" ? asc(orderColumn) : desc(orderColumn);
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
          normalizeRow({
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
      const orderBy =
        safe.sortDir === "asc" ? asc(orderColumn) : desc(orderColumn);
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
          normalizeRow({
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
      return rows[0] ? normalizeRow(rows[0]) : null;
    },
    sqlite: async ({ db, table }) => {
      const rows = await db
        .select()
        .from(table)
        .where(and(eq(table.id, id), eq(table.userId, userId)))
        .limit(1);
      return rows[0] ? normalizeRow(rows[0]) : null;
    },
  });
}

export async function getContentItemById(id: string) {
  return withContentDb({
    pg: async ({ db, table }) => {
      const rows = await db.select().from(table).where(eq(table.id, id)).limit(1);
      return rows[0] ? normalizeRow(rows[0]) : null;
    },
    sqlite: async ({ db, table }) => {
      const rows = await db.select().from(table).where(eq(table.id, id)).limit(1);
      return rows[0] ? normalizeRow(rows[0]) : null;
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
      if (value === null) {
        return false;
      }
      return true;
    })
  ) as typeof data;

  if (Object.keys(cleaned).length === 0) {
    return getContentItem(userId, id);
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
      await db
        .delete(table)
        .where(and(eq(table.id, id), eq(table.userId, userId)));
    },
    sqlite: async ({ db, table }) => {
      await db
        .delete(table)
        .where(and(eq(table.id, id), eq(table.userId, userId)));
    },
  });
}
