"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSocketIO } from "@/components/studio/socketIO-provider";
import type { ContentStatus } from "@/lib/data/content";
import { queryKeys } from "@/lib/http/query-keys";
import { sdk } from "@/lib/sdk";
import {
  commitUpdatedContentToCaches,
  removeContentFromCachedLists,
  rollbackMultiQueryOptimisticUpdate,
} from "@/lib/http/query-cache";
import { syncContentQueries } from "@/lib/http/query-sync";
import type { ContentItem, ContentListResponse, PublishListResponse, PublishRecord, RenderItem, RenderListResponse } from "@/types";

type UseContentListOptions = {
  query?: string;
  page?: number;
  limit?: number;
  status?: ContentStatus | "all";
  sortBy?: "createdAt" | "updatedAt" | "title" | "status";
  sortDir?: "asc" | "desc";
  enableSocketRefresh?: boolean;
};

type LocalContentListResponse = ContentListResponse & {
  page?: number;
  limit?: number;
};

export const useContentItem = (id: string | undefined, options?: { enabled?: boolean }) =>
  useQuery<ContentItem>({
    queryKey: queryKeys.contentItem(id),
    enabled: (options?.enabled ?? true) && Boolean(id),
    refetchOnMount: "always",
    queryFn: async () => {
      if (!id) {
        throw new Error("Content id is required.");
      }
      return sdk.content.get(id);
    },
  });

export const useContentList = (options: UseContentListOptions = {}) => {
  const { eventToken } = useSocketIO();
  const query = options.query ?? "";
  const page = options.page ?? 1;
  const limit = options.limit ?? 50;
  const status = options.status ?? "all";
  const sortBy = options.sortBy ?? "createdAt";
  const sortDir = options.sortDir ?? "desc";
  const queryClient = useQueryClient();
  const enableSocketRefresh = options.enableSocketRefresh ?? true;

  const searchParams = new URLSearchParams();
  if (query.trim()) {
    searchParams.set("q", query.trim());
  }
  if (status && status !== "all") {
    searchParams.set("status", status);
  }
  if (sortBy) {
    searchParams.set("sortBy", sortBy);
  }
  if (sortDir) {
    searchParams.set("sortDir", sortDir);
  }
  searchParams.set("page", String(page));
  searchParams.set("limit", String(limit));
  const queryKey = queryKeys.contentList({ query, page, limit, status, sortBy, sortDir });

  const { data, isLoading, isFetching, refetch } = useQuery<LocalContentListResponse>({
    queryKey,
    queryFn: async () => {
      return sdk.content.list({
        q: searchParams.get("q") ?? undefined,
        status: searchParams.get("status") ?? undefined,
        sortBy: searchParams.get("sortBy") ?? undefined,
        sortDir: searchParams.get("sortDir") ?? undefined,
        page,
        limit,
      });
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: "always",
  });

  useEffect(() => {
    if (enableSocketRefresh && eventToken > 0) {
      void syncContentQueries(queryClient);
    }
  }, [enableSocketRefresh, eventToken, queryClient]);

  return {
    items: data?.items ?? [],
    total: Number.isFinite(data?.total) ? data?.total ?? 0 : 0,
    loading: isFetching,
    initialLoading: isLoading,
    refresh: refetch,
    queryKey,
    page,
    limit,
  };
};

export const useContentRenders = (params: {
  id?: string | null;
  page?: number;
  limit?: number;
  enabled?: boolean;
}) => {
  const { id, page = 1, limit = 20, enabled = true } = params;

  return useQuery<RenderListResponse>({
    queryKey: queryKeys.contentRenders(id, page, limit),
    enabled: Boolean(id) && enabled,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    queryFn: async () => {
      if (!id) {
        return { page, limit, total: 0, items: [] };
      }
      return sdk.content.renders(id, page, limit);
    },
  });
};

export const useSimpleContentRenders = (params: {
  id?: string | null;
  enabled?: boolean;
  limit?: number;
}) => {
  const { id, enabled = true, limit = 50 } = params;

  return useQuery<RenderItem[]>({
    queryKey: queryKeys.contentRendersSimple(id),
    enabled: Boolean(id) && enabled,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    queryFn: async () => {
      if (!id) return [];
      const payload = await sdk.content.renders(id, 1, limit);
      return payload.items as RenderItem[];
    },
  });
};

export const useContentPublishes = (params: {
  id?: string | null;
  enabled?: boolean;
}) => {
  const { id, enabled = true } = params;

  return useQuery<PublishListResponse, Error>({
    queryKey: queryKeys.publishes(id),
    enabled: Boolean(id) && enabled,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    queryFn: async () => {
      if (!id) {
        return { publishes: [] };
      }
      const payload = await sdk.content.listPublishes(id);
      return { publishes: payload.publishes as PublishRecord[] };
    },
  });
};

export const useCreateContentMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => sdk.content.create(payload),
    onSuccess: async (created) => {
      commitUpdatedContentToCaches({ queryClient, item: created });
      await syncContentQueries(queryClient);
    },
  });
};

export const useDeleteContentMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      keepRenders,
    }: {
      id: string;
      keepRenders?: boolean;
    }) => {
      await sdk.content.remove(id, keepRenders);
      return { id };
    },
    onMutate: async ({ id }) =>
      removeContentFromCachedLists({
        queryClient,
        contentId: id,
      }),
    onError: (_error, _variables, context) => {
      rollbackMultiQueryOptimisticUpdate({ queryClient, context });
    },
    onSettled: async () => {
      await syncContentQueries(queryClient);
    },
  });
};

export const useContentUpdateMutation = <TVariables>(params: {
  mutationFn: (variables: TVariables) => Promise<ContentItem>;
  onSuccess?: (updated: ContentItem, variables: TVariables) => void | Promise<void>;
  onError?: (error: unknown, variables: TVariables) => void | Promise<void>;
}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: params.mutationFn,
    onSuccess: async (updated, variables) => {
      commitUpdatedContentToCaches({ queryClient, item: updated });
      await syncContentQueries(queryClient);
      await params.onSuccess?.(updated, variables);
    },
    onError: async (error, variables) => {
      await params.onError?.(error, variables);
    },
  });
};
