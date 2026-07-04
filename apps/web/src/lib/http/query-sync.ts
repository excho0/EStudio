"use client";

import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/http/query-keys";
import { reconcileResourceFamily } from "@/lib/http/query-cache";

export const syncContentQueries = async (queryClient: QueryClient) => {
  await reconcileResourceFamily({
    queryClient,
    queryKey: queryKeys.contentListBase,
  });
};

export const syncPublishQueries = async (queryClient: QueryClient) => {
  await Promise.all([
    reconcileResourceFamily({
      queryClient,
      queryKey: queryKeys.publishesBase,
    }),
    reconcileResourceFamily({
      queryClient,
      queryKey: queryKeys.contentListBase,
    }),
  ]);
};

export const syncSettingsQueries = async (queryClient: QueryClient) => {
  await reconcileResourceFamily({
    queryClient,
    queryKey: queryKeys.settings,
  });
};

export const syncProfileQueries = async (queryClient: QueryClient) => {
  await Promise.all([
    reconcileResourceFamily({
      queryClient,
      queryKey: queryKeys.profile,
    }),
    reconcileResourceFamily({
      queryClient,
      queryKey: queryKeys.profileConnections,
    }),
  ]);
};

export const syncApiKeyQueries = async (queryClient: QueryClient) => {
  await reconcileResourceFamily({
    queryClient,
    queryKey: queryKeys.apiKeys,
  });
};

export const syncDashboardStatsQueries = async (queryClient: QueryClient) => {
  await queryClient.invalidateQueries({
    predicate: ({ queryKey }) => Array.isArray(queryKey) && queryKey[0] === "dashboard-stats",
    refetchType: "active",
  });
};
