"use client";

import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/http/query-keys";
import { sdk } from "@/lib/sdk";

export const useApiKeys = (options?: { enabled?: boolean; staleTime?: number }) =>
  useQuery({
    queryKey: queryKeys.apiKeys,
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? 30_000,
    queryFn: async () => sdk.apiKeys.list(),
  });
