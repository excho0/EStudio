"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSocketIO } from "./socketIO-provider";
import { z } from "zod";
import { contentItemSchema } from "@/lib/data/content";

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
  const queryKey = ["content", { query, page, limit }] as const;

  const { data, isLoading, isFetching, refetch } = useQuery<ContentListResponse>({
    queryKey,
    queryFn: async () => {
      const response = await fetch(`/api/content?${searchParams.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to load content list");
      }
      return (await response.json()) as ContentListResponse;
    },
    placeholderData: (previous) => previous,
  });

  useEffect(() => {
    if (eventToken > 0) {
      queryClient.invalidateQueries({ queryKey: ["content"] });
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
