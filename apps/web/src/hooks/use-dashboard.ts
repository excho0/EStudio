"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSocketIO } from "@/components/studio/socketIO-provider";
import { queryKeys } from "@/lib/http/query-keys";
import { sdk } from "@/lib/sdk";
import { syncDashboardStatsQueries } from "@/lib/http/query-sync";

export const useDashboardStats = (range: number | "all" = 7) => {
  const { eventToken } = useSocketIO();
  const queryClient = useQueryClient();
  const queryKey = queryKeys.dashboardStats(range);

  const query = useQuery({
    queryKey,
    queryFn: () => sdk.dashboard.stats(range),
  });

  useEffect(() => {
    if (eventToken > 0) {
      void syncDashboardStatsQueries(queryClient);
    }
  }, [eventToken, queryClient]);

  return {
    data: query.data,
    loading: query.isFetching,
    initialLoading: query.isLoading,
    refresh: query.refetch,
  };
};
