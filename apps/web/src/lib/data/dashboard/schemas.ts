import { z } from "zod";

export const dashboardTrendPointSchema = z.object({
  date: z.string(),
  value: z.number(),
});

export const dashboardStatDiffSchema = z.object({
  value: z.number(),
  decimals: z.number().int().min(0).default(1),
  upIsPositive: z.boolean().optional(),
  label: z.string().optional(),
});

export const dashboardStatsResponseSchema = z.object({
  totals: z.object({
    total: z.number(),
    uploaded: z.number(),
    rendering: z.number(),
    rendered: z.number(),
    failed: z.number(),
  }),
  diffs: z.object({
    projects: dashboardStatDiffSchema,
    rendered: dashboardStatDiffSchema,
    failed: dashboardStatDiffSchema,
  }),
  trends: z.object({
    projects: z.array(dashboardTrendPointSchema),
    rendered: z.array(dashboardTrendPointSchema),
    failed: z.array(dashboardTrendPointSchema),
  }),
  windowDays: z.number().int().min(1),
});
