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
import type { ContentStatus } from "./schemas";

const ALLOWED_STATUS_TRANSITIONS: Record<
  ContentStatus,
  ReadonlyArray<ContentStatus>
> = {
  uploaded: ["uploaded", "queued", "rendering", "rendered", "failed"],
  queued: ["uploaded", "queued", "rendering", "rendered", "failed"],
  rendering: ["uploaded", "queued", "rendering", "rendered", "failed"],
  rendered: ["rendered", "queued", "rendering", "failed"],
  failed: ["failed", "queued", "rendering", "rendered"],
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

type DashboardTrendPoint = {
  date: string;
  value: number;
};

type DashboardStatsRange = number | "all";

function formatUtcDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function buildDayWindow(days: number) {
  const today = new Date();
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  const dates: string[] = [];
  const counts = new Map<string, number>();
  for (let index = 0; index < days; index += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const key = formatUtcDateKey(date);
    dates.push(key);
    counts.set(key, 0);
  }

  return { start, dates, counts };
}

function toTrendPoints(dates: string[], counts: Map<string, number>): DashboardTrendPoint[] {
  return dates.map((date) => ({
    date,
    value: counts.get(date) ?? 0,
  }));
}

function sampleTrendPoints(
  points: DashboardTrendPoint[],
  maxPoints = 20,
): DashboardTrendPoint[] {
  if (points.length <= maxPoints) {
    return points;
  }

  const sampled: DashboardTrendPoint[] = [];
  const lastIndex = points.length - 1;

  for (let index = 0; index < maxPoints; index += 1) {
    const sourceIndex = Math.round((index / (maxPoints - 1)) * lastIndex);
    const point = points[sourceIndex];
    if (!sampled.length || sampled[sampled.length - 1]?.date !== point.date) {
      sampled.push(point);
    }
  }

  if (sampled[sampled.length - 1]?.date !== points[lastIndex]?.date) {
    sampled.push(points[lastIndex]);
  }

  return sampled;
}

function toCompressedAllTimeTrendPoints(
  dates: string[],
  counts: Map<string, number>,
): DashboardTrendPoint[] {
  let runningTotal = 0;
  const activePoints: DashboardTrendPoint[] = [];

  for (const date of dates) {
    const increment = counts.get(date) ?? 0;
    if (increment <= 0) {
      continue;
    }
    runningTotal += increment;
    activePoints.push({
      date,
      value: runningTotal,
    });
  }

  if (activePoints.length === 0) {
    const startDate = dates[0] ?? new Date().toISOString().slice(0, 10);
    const endDate = dates[dates.length - 1] ?? startDate;
    return [
      { date: startDate, value: 0 },
      { date: endDate, value: 0 },
    ];
  }

  const points: DashboardTrendPoint[] = [
    { date: dates[0] ?? activePoints[0]!.date, value: 0 },
    ...activePoints,
  ];

  const lastPoint = activePoints[activePoints.length - 1]!;
  const endDate = dates[dates.length - 1] ?? lastPoint.date;
  if (endDate !== lastPoint.date) {
    points.push({
      date: endDate,
      value: lastPoint.value,
    });
  }

  return sampleTrendPoints(points, 18);
}

function sumTrendValues(points: DashboardTrendPoint[]) {
  return points.reduce((total, point) => total + point.value, 0);
}

function buildStatDiff(
  points: DashboardTrendPoint[],
  options?: {
    upIsPositive?: boolean;
    decimals?: number;
    label?: string;
  },
) {
  const safePoints =
    points.length >= 2
      ? points
      : [
          { date: "start", value: 0 },
          { date: "end", value: 0 },
        ];
  const midpoint = Math.max(1, Math.floor(safePoints.length / 2));
  const previous = safePoints.slice(0, midpoint);
  const current = safePoints.slice(midpoint);

  const previousTotal = sumTrendValues(previous);
  const currentTotal = sumTrendValues(current);

  let value = 0;
  if (previousTotal === 0) {
    value = currentTotal === 0 ? 0 : 100;
  } else {
    value = ((currentTotal - previousTotal) / previousTotal) * 100;
  }

  return {
    value,
    decimals: options?.decimals ?? 1,
    ...(options?.upIsPositive === false ? { upIsPositive: false } : {}),
    ...(options?.label ? { label: options.label } : {}),
  };
}

function buildAllTimeWindow(rows: Array<{ createdAt: string; updatedAt: string; status: string }>) {
  const validDates = rows.flatMap((row) => {
    const createdAt = new Date(row.createdAt);
    const updatedAt = new Date(row.updatedAt);
    return [
      createdAt,
      updatedAt,
    ].filter((value) => !Number.isNaN(value.getTime()));
  });

  if (validDates.length === 0) {
    return buildDayWindow(7);
  }

  let start = validDates.reduce((earliest, current) =>
    current.getTime() < earliest.getTime() ? current : earliest,
  );
  start = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));

  const today = new Date();
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const daySpan = Math.max(
    1,
    Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1,
  );

  return buildDayWindow(daySpan);
}

export async function getDashboardStats(
  userId: string,
  range: DashboardStatsRange = 7,
) {
  const totals = await getContentStats(userId);

  const rows: Array<{ createdAt: string; updatedAt: string; status: string }> =
    await withContentDb({
    pg: async ({ db, table }) => {
      const rawRows = await db
        .select({
          createdAt: table.createdAt,
          updatedAt: table.updatedAt,
          status: table.status,
        })
        .from(table)
        .where(eq(table.userId, userId));
      return rawRows.map((row) => ({
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        status: row.status,
      }));
    },
    sqlite: async ({ db, table }) => {
      return db
        .select({
          createdAt: table.createdAt,
          updatedAt: table.updatedAt,
          status: table.status,
        })
        .from(table)
        .where(eq(table.userId, userId));
    },
  });

  const safeWindowDays =
    range === "all" ? null : Math.max(1, Math.min(365, Math.trunc(range)));
  const resolvedWindowDays = safeWindowDays ?? 7;
  const projectsWindow =
    range === "all" ? buildAllTimeWindow(rows) : buildDayWindow(resolvedWindowDays);
  const renderedWindow =
    range === "all" ? buildAllTimeWindow(rows) : buildDayWindow(resolvedWindowDays);
  const failedWindow =
    range === "all" ? buildAllTimeWindow(rows) : buildDayWindow(resolvedWindowDays);

  for (const row of rows) {
    const createdAt = new Date(row.createdAt);
    if (!Number.isNaN(createdAt.getTime()) && createdAt >= projectsWindow.start) {
      const key = formatUtcDateKey(createdAt);
      if (projectsWindow.counts.has(key)) {
        projectsWindow.counts.set(key, (projectsWindow.counts.get(key) ?? 0) + 1);
      }
    }

    const updatedAt = new Date(row.updatedAt);
    if (Number.isNaN(updatedAt.getTime())) {
      continue;
    }
    const updatedKey = formatUtcDateKey(updatedAt);
    if (row.status === "rendered" && renderedWindow.counts.has(updatedKey)) {
      renderedWindow.counts.set(
        updatedKey,
        (renderedWindow.counts.get(updatedKey) ?? 0) + 1,
      );
    }
    if (row.status === "failed" && failedWindow.counts.has(updatedKey)) {
      failedWindow.counts.set(updatedKey, (failedWindow.counts.get(updatedKey) ?? 0) + 1);
    }
  }

  const rawProjectTrendPoints = toTrendPoints(projectsWindow.dates, projectsWindow.counts);
  const rawRenderedTrendPoints = toTrendPoints(renderedWindow.dates, renderedWindow.counts);
  const rawFailedTrendPoints = toTrendPoints(failedWindow.dates, failedWindow.counts);
  const projectTrendPoints =
    range === "all"
      ? toCompressedAllTimeTrendPoints(projectsWindow.dates, projectsWindow.counts)
      : rawProjectTrendPoints;
  const renderedTrendPoints =
    range === "all"
      ? toCompressedAllTimeTrendPoints(renderedWindow.dates, renderedWindow.counts)
      : rawRenderedTrendPoints;
  const failedTrendPoints =
    range === "all"
      ? toCompressedAllTimeTrendPoints(failedWindow.dates, failedWindow.counts)
      : rawFailedTrendPoints;

  return {
    totals,
    diffs: {
      projects: buildStatDiff(projectTrendPoints),
      rendered: buildStatDiff(renderedTrendPoints),
      failed: buildStatDiff(failedTrendPoints, { upIsPositive: false }),
    },
    trends: {
      projects: projectTrendPoints,
      rendered: renderedTrendPoints,
      failed: failedTrendPoints,
    },
    windowDays: range === "all" ? projectsWindow.dates.length : resolvedWindowDays,
  };
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
