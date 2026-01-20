import { desc, eq, like, or, sql } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";
import { z } from "zod";

import {
  getDrizzleDb,
  type PostgresDrizzleDb,
  type SqliteDrizzleDb,
} from "@/lib/drizzle/client";
import { schema, sqliteSchema } from "@/lib/drizzle/schema";

const isPostgres = Boolean(process.env.POSTGRES_URL ?? process.env.DATABASE_URL);

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
  title: z.string().min(1),
  createdAt: z.string(),
  thumbnailPath: z.string(),
  videoPath: z.string(),
  songPath: z.string(),
  renderPath: z.string().optional().nullable(),
  status: z.enum(["uploaded", "rendering", "rendered", "failed"]),
  songDurationSeconds: z.number().nonnegative(),
  segmentDurationSeconds: z.number().nonnegative(),
  fadeDurationSeconds: z.number().nonnegative(),
  videoDurationSeconds: z.number().nonnegative().optional().nullable(),
  fps: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export type ContentItemRow = z.infer<typeof contentItemSchema>;

export const contentQuerySchema = z.object({
  q: z.string().trim().optional().default(""),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export const contentCreateSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1),
  thumbnailPath: z.string().min(1),
  videoPath: z.string().min(1),
  songPath: z.string().min(1),
  status: z.enum(["uploaded", "rendering", "rendered", "failed"]).default("uploaded"),
  songDurationSeconds: z.number().nonnegative().default(0),
  segmentDurationSeconds: z.number().nonnegative().default(4),
  fadeDurationSeconds: z.number().nonnegative().default(1),
  videoDurationSeconds: z.number().nonnegative().default(0),
  fps: z.number().int().positive().default(30),
  width: z.number().int().positive().default(1280),
  height: z.number().int().positive().default(720),
});

export const contentUpdateSchema = contentCreateSchema
  .partial()
  .extend({
    renderPath: z.string().optional().nullable(),
  })
  .omit({ id: true, thumbnailPath: true, videoPath: true, songPath: true });

const normalizeRow = (row: unknown): ContentItemRow => {
  const record = row as Record<string, unknown>;
  const toIso = (value: unknown) =>
    value instanceof Date ? value.toISOString() : value;
  const parsed = contentItemSchema.safeParse({
    ...record,
    createdAt: toIso(record.createdAt),
    updatedAt: toIso(record.updatedAt),
    renderPath: record.renderPath ?? null,
    videoDurationSeconds: record.videoDurationSeconds ?? null,
  });
  if (!parsed.success) {
    throw new Error(`Invalid content row: ${parsed.error.message}`);
  }
  return parsed.data;
};

export async function listContentItems(query: z.infer<typeof contentQuerySchema>) {
  const safe = contentQuerySchema.parse(query);
  const offset = (safe.page - 1) * safe.limit;
  const term = safe.q.toLowerCase();
  return withContentDb({
    pg: async ({ db, table }) => {
      const filters = term
        ? or(
            like(sql`lower(${table.title})`, `%${term}%`),
            like(sql`lower(${table.status})`, `%${term}%`),
            like(sql`lower(${table.id})`, `%${term}%`)
          )
        : undefined;
      const rows = await db
        .select()
        .from(table)
        .where(filters)
        .orderBy(desc(table.createdAt))
        .limit(safe.limit)
        .offset(offset);
      const totalRow = await db
        .select({ count: sql<number>`count(*)` })
        .from(table)
        .where(filters);
      return {
        items: rows.map(normalizeRow),
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
      const rows = await db
        .select()
        .from(table)
        .where(filters)
        .orderBy(desc(table.createdAt))
        .limit(safe.limit)
        .offset(offset);
      const totalRow = await db
        .select({ count: sql<number>`count(*)` })
        .from(table)
        .where(filters);
      return {
        items: rows.map(normalizeRow),
        total: Number(totalRow[0]?.count ?? 0),
        page: safe.page,
        limit: safe.limit,
      };
    },
  });
}

export async function getContentItem(id: string) {
  return withContentDb({
    pg: async ({ db, table }) => {
      const rows = await db
        .select()
        .from(table)
        .where(eq(table.id, id))
        .limit(1);
      return rows[0] ? normalizeRow(rows[0]) : null;
    },
    sqlite: async ({ db, table }) => {
      const rows = await db
        .select()
        .from(table)
        .where(eq(table.id, id))
        .limit(1);
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
      };
      await db.insert(table).values(values);
    },
    sqlite: async ({ db, table, now }) => {
      const values: InferInsertModel<typeof sqliteSchema.contentItems> = {
        ...data,
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(table).values(values);
    },
  });
  return getContentItem(data.id);
}

export async function updateContentItem(
  id: string,
  updates: z.infer<typeof contentUpdateSchema>
) {
  const data = contentUpdateSchema.parse(updates);
  await withContentDb({
    pg: async ({ db, table, now }) => {
      const values: Partial<InferInsertModel<typeof schema.contentItems>> = {
        ...data,
        updatedAt: now,
      };
      await db.update(table).set(values).where(eq(table.id, id));
    },
    sqlite: async ({ db, table, now }) => {
      const values: Partial<InferInsertModel<typeof sqliteSchema.contentItems>> = {
        ...data,
        updatedAt: now,
      };
      await db.update(table).set(values).where(eq(table.id, id));
    },
  });
  return getContentItem(id);
}

export async function deleteContentItem(id: string) {
  await withContentDb({
    pg: async ({ db, table }) => {
      await db.delete(table).where(eq(table.id, id));
    },
    sqlite: async ({ db, table }) => {
      await db.delete(table).where(eq(table.id, id));
    },
  });
}
