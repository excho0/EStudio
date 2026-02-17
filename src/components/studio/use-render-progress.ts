"use client";

import { useEffect, useState } from "react";
import { useSocketIO } from "./socketIO-provider";
import type { RenderProgress } from "@/types";
import { sdk } from "@/lib/sdk";

export type { RenderProgress } from "@/types";

export const useRenderProgress = (options?: { paused?: boolean }) => {
  const paused = options?.paused === true;
  const { socket } = useSocketIO();
  const [progressMap, setProgressMap] = useState<Record<string, RenderProgress>>({});

  useEffect(() => {
    if (paused) {
      return;
    }
    let cancelled = false;
    const hydrate = async () => {
      try {
        const response = await sdk.content.progress();
        if (cancelled) return;
        setProgressMap((response.items ?? {}) as Record<string, RenderProgress>);
      } catch {
        // Keep local socket-driven state if snapshot fetch fails.
      }
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [paused]);

  useEffect(() => {
    if (!socket || paused) {
      return;
    }

    const handleProgress = (payload: RenderProgress) => {
      setProgressMap((current) => ({ ...current, [payload.id]: payload }));
    };
    const clearProgress = (id: string) => {
      setProgressMap((current) => {
        if (!(id in current)) return current;
        const next = { ...current };
        delete next[id];
        return next;
      });
    };
    const handleComplete = (payload: { id?: string }) => {
      if (!payload?.id) return;
      clearProgress(payload.id);
    };
    const handleContentUpdate = (payload: { id?: string; status?: string }) => {
      if (!payload?.id) return;
      if (payload.status && payload.status !== "rendering") {
        clearProgress(payload.id);
      }
    };

    socket.on("render:progress", handleProgress);
    socket.on("render:complete", handleComplete);
    socket.on("content:update", handleContentUpdate);

    return () => {
      socket.off("render:progress", handleProgress);
      socket.off("render:complete", handleComplete);
      socket.off("content:update", handleContentUpdate);
    };
  }, [socket, paused]);

  return progressMap;
};
