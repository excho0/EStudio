"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/http/query-keys";
import { sdk } from "@/lib/sdk";
import type { SettingsResponse } from "@/types";

export const useAppSettings = (options?: { enabled?: boolean; staleTime?: number }) =>
  useQuery<SettingsResponse>({
    queryKey: queryKeys.settings,
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? 30_000,
    queryFn: async () => sdk.settings.get(),
  });
