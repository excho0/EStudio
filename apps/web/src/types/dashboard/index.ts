import { z } from "zod";
import { dashboardStatsResponseSchema } from "@/lib/data/dashboard";

export type DashboardStatsResponse = z.infer<typeof dashboardStatsResponseSchema>;

