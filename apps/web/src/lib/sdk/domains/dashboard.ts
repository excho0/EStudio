import { ApiClient } from "@/lib/sdk/client";
import { dashboardStatsResponseSchema } from "@/lib/data/dashboard";
import type { DashboardStatsResponse } from "@/types";

const client = new ApiClient();

export const dashboardSdk = {
  stats(range: number | "all" = 7): Promise<DashboardStatsResponse> {
    const query =
      range === "all"
        ? "range=all"
        : `days=${encodeURIComponent(String(range))}`;
    return client.get(
      `/api/dashboard/stats?${query}`,
      "Failed to load dashboard stats",
      dashboardStatsResponseSchema,
    );
  },
};
