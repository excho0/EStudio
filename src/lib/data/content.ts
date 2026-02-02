import { and, desc, eq, like, or, sql } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";
import { z } from "zod";

import {
  getDrizzleDb,
  isPostgres,
  type PostgresDrizzleDb,
  type SqliteDrizzleDb,
} from "@/lib/drizzle/client";
import { schema, sqliteSchema } from "@/lib/drizzle/schema";

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
  status: z.enum(["uploaded", "rendering", "rendered", "failed"]),
  songDurationSeconds: z.number().nonnegative(),
  segmentDurationSeconds: z.number().nonnegative(),
  fadeDurationSeconds: z.number().nonnegative(),
  introFadeSeconds: z.number().nonnegative(),
  outroFadeSeconds: z.number().nonnegative(),
  audioFadeInSeconds: z.number().nonnegative(),
  audioFadeOutSeconds: z.number().nonnegative(),
  audioFadeInOffsetSeconds: z.number().nonnegative(),
  audioFadeOutOffsetSeconds: z.number().nonnegative(),
  scalePercent: z.number().nonnegative(),
  visualizationEnabled: z.boolean().default(true),
  visualizationBars: z.number().int().positive().default(128),
  edgeRaysEnabled: z.boolean().default(true),
  edgeRaysIntensity: z.number().min(0).max(1).default(0.85),
  edgeRaysVocalBalance: z.number().min(0).max(1).default(0.6),
  videoDurationSeconds: z.number().nonnegative().optional().nullable(),
  overlapRatio: z.number().min(0).max(0.9).optional().nullable(),
  playbackRate: z.number().positive(),
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
  userId: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(["uploaded", "rendering", "rendered", "failed"]).default("uploaded"),
  colorPalette: z.array(z.string()).optional().nullable(),
  paletteMode: z.enum(["auto", "manual"]).default("auto"),
  songDurationSeconds: z.number().nonnegative().default(0),
  segmentDurationSeconds: z.number().nonnegative().default(4),
  fadeDurationSeconds: z.number().nonnegative().default(1),
  introFadeSeconds: z.number().nonnegative().default(0),
  outroFadeSeconds: z.number().nonnegative().default(0),
  audioFadeInSeconds: z.number().nonnegative().default(0),
  audioFadeOutSeconds: z.number().nonnegative().default(0),
  audioFadeInOffsetSeconds: z.number().nonnegative().default(0),
  audioFadeOutOffsetSeconds: z.number().nonnegative().default(0),
  scalePercent: z.number().nonnegative().default(100),
  visualizationEnabled: z.boolean().default(true),
  visualizationBars: z.number().int().positive().default(128),
  edgeRaysEnabled: z.boolean().default(true),
  edgeRaysIntensity: z.number().min(0).max(1).default(0.85),
  edgeRaysVocalBalance: z.number().min(0).max(1).default(0.6),
  videoDurationSeconds: z.number().nonnegative().default(0),
  overlapRatio: z.number().min(0).max(0.9).optional().nullable().default(null),
  playbackRate: z.number().positive().default(1),
  fps: z.number().int().positive().default(30),
  width: z.number().int().positive().default(1280),
  height: z.number().int().positive().default(720),
});

export const contentUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  status: z.enum(["uploaded", "rendering", "rendered", "failed"]).optional(),
  colorPalette: z.array(z.string()).optional().nullable(),
  paletteMode: z.enum(["auto", "manual"]).optional(),
  songDurationSeconds: z.number().nonnegative().optional(),
  segmentDurationSeconds: z.number().nonnegative().optional(),
  fadeDurationSeconds: z.number().nonnegative().optional(),
  introFadeSeconds: z.number().nonnegative().optional(),
  outroFadeSeconds: z.number().nonnegative().optional(),
  audioFadeInSeconds: z.number().nonnegative().optional(),
  audioFadeOutSeconds: z.number().nonnegative().optional(),
  audioFadeInOffsetSeconds: z.number().nonnegative().optional(),
  audioFadeOutOffsetSeconds: z.number().nonnegative().optional(),
  scalePercent: z.number().nonnegative().optional(),
  visualizationEnabled: z.boolean().optional(),
  visualizationBars: z.number().int().positive().optional(),
  edgeRaysEnabled: z.boolean().optional(),
  edgeRaysIntensity: z.number().min(0).max(1).optional(),
  edgeRaysVocalBalance: z.number().min(0).max(1).optional(),
  videoDurationSeconds: z.number().nonnegative().optional(),
  overlapRatio: z.number().min(0).max(0.9).optional().nullable(),
  playbackRate: z.number().positive().optional(),
  fps: z.number().int().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

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

const normalizeRow = (row: unknown): ContentItemRow => {
  const record = row as Record<string, unknown>;
  const toIso = (value: unknown) =>
    value instanceof Date ? value.toISOString() : value;
  const parsed = contentItemSchema.safeParse({
    ...record,
    createdAt: toIso(record.createdAt),
    updatedAt: toIso(record.updatedAt),
    colorPalette: parseColorPalette(record.colorPalette),
    paletteMode: record.paletteMode ?? "auto",
    videoDurationSeconds: record.videoDurationSeconds ?? null,
    playbackRate: record.playbackRate ?? 1,
    overlapRatio: record.overlapRatio ?? null,
    introFadeSeconds: record.introFadeSeconds ?? 0,
    outroFadeSeconds: record.outroFadeSeconds ?? 0,
    audioFadeInSeconds: record.audioFadeInSeconds ?? 0,
    audioFadeOutSeconds: record.audioFadeOutSeconds ?? 0,
    audioFadeInOffsetSeconds: record.audioFadeInOffsetSeconds ?? 0,
    audioFadeOutOffsetSeconds: record.audioFadeOutOffsetSeconds ?? 0,
    scalePercent: record.scalePercent ?? 100,
    visualizationEnabled:
      typeof record.visualizationEnabled === "boolean"
        ? record.visualizationEnabled
        : Boolean(record.visualizationEnabled ?? true),
    visualizationBars: record.visualizationBars ?? 128,
    edgeRaysEnabled:
      typeof record.edgeRaysEnabled === "boolean"
        ? record.edgeRaysEnabled
        : Boolean(record.edgeRaysEnabled ?? true),
    edgeRaysIntensity: record.edgeRaysIntensity ?? 0.85,
    edgeRaysVocalBalance: record.edgeRaysVocalBalance ?? 0.6,
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
        .where(filters ? sql`${filters} and ${table.userId} = ${userId}` : eq(table.userId, userId))
        .orderBy(desc(table.createdAt))
        .limit(safe.limit)
        .offset(offset);
      const totalRow = await db
        .select({ count: sql<number>`count(*)` })
        .from(table)
        .where(filters ? sql`${filters} and ${table.userId} = ${userId}` : eq(table.userId, userId));
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
        .where(filters ? sql`${filters} and ${table.userId} = ${userId}` : eq(table.userId, userId))
        .orderBy(desc(table.createdAt))
        .limit(safe.limit)
        .offset(offset);
      const totalRow = await db
        .select({ count: sql<number>`count(*)` })
        .from(table)
        .where(filters ? sql`${filters} and ${table.userId} = ${userId}` : eq(table.userId, userId));
      return {
        items: rows.map(normalizeRow),
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
        visualizationEnabled: data.visualizationEnabled ? 1 : 0,
        edgeRaysEnabled: data.edgeRaysEnabled ? 1 : 0,
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
      const { colorPalette, visualizationEnabled, edgeRaysEnabled, ...rest } = cleaned;
      const values: Partial<InferInsertModel<typeof sqliteSchema.contentItems>> = {
        ...rest,
        updatedAt: now,
      };
      if (colorPalette !== undefined) {
        values.colorPalette = serializeColorPalette(colorPalette);
      }
      if (visualizationEnabled !== undefined) {
        values.visualizationEnabled = visualizationEnabled ? 1 : 0;
      }
      if (edgeRaysEnabled !== undefined) {
        values.edgeRaysEnabled = edgeRaysEnabled ? 1 : 0;
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
