"use client";

import { useEffect, useState } from "react";
import { useSocketIO } from "./socketIO-provider";
import type { RenderProgress } from "@/types";
import { fetchJson } from "@/lib/http/fetch-json";

export type { RenderProgress } from "@/types";

export const useRenderProgress = () => {
  const { socket } = useSocketIO();
  const [progressMap, setProgressMap] = useState<Record<string, RenderProgress>>({});

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      try {
        const response = await fetchJson<{ items?: Record<string, RenderProgress> }>(
          "/api/content/progress",
          undefined,
          "Failed to load render progress."
        );
        if (cancelled) return;
        setProgressMap(response.items ?? {});
      } catch {
        // Keep local socket-driven state if snapshot fetch fails.
      }
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleProgress = (payload: RenderProgress) => {
      setProgressMap((current) => ({ ...current, [payload.id]: payload }));
    };

    socket.on("render:progress", handleProgress);

    return () => {
      socket.off("render:progress", handleProgress);
    };
  }, [socket]);

  return progressMap;
};
