"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSocketIO } from "./socketIO-provider";
import { z } from "zod";
import { contentItemSchema } from "@/lib/data/content";
import { queryKeys } from "@/lib/query-keys";
import { fetchJson } from "@/lib/fetch-json";

export type ContentItem = z.infer<typeof contentItemSchema>;

type UseContentListOptions = {
  query?: string;
  page?: number;
  limit?: number;
  status?: "uploaded" | "rendering" | "rendered" | "failed" | "all";
  sortBy?: "createdAt" | "updatedAt" | "title" | "status";
  sortDir?: "asc" | "desc";
  enableSocketRefresh?: boolean;
};

type ContentListResponse = {
  items: ContentItem[];
  total: number;
  page?: number;
  limit?: number;
};

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

  const { data, isLoading, isFetching, refetch } = useQuery<ContentListResponse>({
    queryKey,
    queryFn: async () => {
      return fetchJson<ContentListResponse>(
        `/api/content?${searchParams.toString()}`,
        undefined,
        "Failed to load content list"
      );
    },
    placeholderData: (previous) => previous,
  });

  useEffect(() => {
    if (enableSocketRefresh && eventToken > 0) {
      queryClient.invalidateQueries({ queryKey: queryKeys.contentListBase });
    }
  }, [enableSocketRefresh, eventToken, queryClient]);

  return {
    items: data?.items ?? [],
    total: Number.isFinite(data?.total) ? data?.total ?? 0 : 0,
    loading: isFetching,
    initialLoading: isLoading,
    refresh: refetch,
    page,
    limit,
  };
};
