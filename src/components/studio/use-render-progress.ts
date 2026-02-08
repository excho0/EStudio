"use client";

import { useEffect, useState } from "react";
import { useSocketIO } from "./socketIO-provider";
import type { RenderProgress } from "@/types";
import { sdk } from "@/lib/sdk";

export type { RenderProgress } from "@/types";

export const useRenderProgress = () => {
  const { socket } = useSocketIO();
  const [progressMap, setProgressMap] = useState<Record<string, RenderProgress>>({});

  useEffect(() => {
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
