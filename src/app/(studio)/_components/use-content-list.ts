"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDashboardSocket } from "./dashboard-socket";

export type ContentItem = {
  id: string;
  title: string;
  createdAt: string;
  thumbnailPath: string;
  videoPath: string;
  songPath: string;
  renderPath?: string;
  status: "uploaded" | "rendering" | "rendered" | "failed";
  songDurationSeconds: number;
  segmentDurationSeconds: number;
  fadeDurationSeconds: number;
  videoDurationSeconds?: number;
  overlapRatio?: number | null;
  playbackRate: number;
  fps: number;
  width: number;
  height: number;
};

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
  const { eventToken } = useDashboardSocket();
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

  const { data, isLoading, refetch } = useQuery<ContentListResponse>({
    queryKey,
    queryFn: async () => {
      const response = await fetch(`/api/content?${searchParams.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to load content list");
      }
      return response.json();
    },
    keepPreviousData: true,
  });

  useEffect(() => {
    if (eventToken > 0) {
      queryClient.invalidateQueries({ queryKey: ["content"] });
    }
  }, [eventToken, queryClient]);

  return {
    items: data?.items ?? [],
    total: Number.isFinite(data?.total) ? data.total : 0,
    loading: isLoading,
    refresh: refetch,
    page,
    limit,
  };
};
