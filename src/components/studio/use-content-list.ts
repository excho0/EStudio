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
  const queryClient = useQueryClient();

  const searchParams = new URLSearchParams();
  if (query.trim()) {
    searchParams.set("q", query.trim());
  }
  searchParams.set("page", String(page));
  searchParams.set("limit", String(limit));
  const queryKey = queryKeys.contentList({ query, page, limit });

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
    if (eventToken > 0) {
      queryClient.invalidateQueries({ queryKey: queryKeys.contentListBase });
    }
  }, [eventToken, queryClient]);

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
