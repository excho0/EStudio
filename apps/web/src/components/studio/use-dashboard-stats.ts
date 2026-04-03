"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSocketIO } from "./socketIO-provider";
import { queryKeys } from "@/lib/http/query-keys";
import { sdk } from "@/lib/sdk";

export const useDashboardStats = (range: number | "all" = 7) => {
  const { eventToken } = useSocketIO();
  const queryClient = useQueryClient();
  const queryKey = queryKeys.dashboardStats(range);

  const query = useQuery({
    queryKey,
    queryFn: () => sdk.dashboard.stats(range),
    placeholderData: (previous) => previous,
  });

  useEffect(() => {
    if (eventToken > 0) {
      void queryClient.invalidateQueries({
        predicate: ({ queryKey: key }) => Array.isArray(key) && key[0] === "dashboard-stats",
      });
    }
  }, [eventToken, queryClient]);

  return {
    data: query.data,
    loading: query.isFetching,
    initialLoading: query.isLoading,
    refresh: query.refetch,
  };
};
