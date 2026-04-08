"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/http/query-keys";
import { sdk } from "@/lib/sdk";
import type { ConnectionsResponse, ProfilePayload } from "@/types";

export const useProfile = (options?: { enabled?: boolean; staleTime?: number }) =>
  useQuery<ProfilePayload>({
    queryKey: queryKeys.profile,
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? 60_000,
    queryFn: async () => sdk.user.profile(),
  });

export const useProfileConnections = (options?: {
  enabled?: boolean;
  staleTime?: number;
}) =>
  useQuery<ConnectionsResponse>({
    queryKey: queryKeys.profileConnections,
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? 60_000,
    queryFn: async () => sdk.user.connections(),
  });
