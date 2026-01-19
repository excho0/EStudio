"use client";

import { useCallback, useEffect, useState } from "react";
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
  fps: number;
  width: number;
  height: number;
};

export const useContentList = () => {
  const { eventToken } = useDashboardSocket();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/content");
    const data = await response.json();
    setItems(data.items ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (eventToken > 0) {
      refresh();
    }
  }, [eventToken, refresh]);

  return { items, loading, refresh };
};
