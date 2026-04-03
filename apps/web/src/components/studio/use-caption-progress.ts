"use client";

import { useEffect, useMemo, useState } from "react";
import { useSocketIO } from "./socketIO-provider";
import type { CaptionProgress } from "@/lib/data/captions/progress";
import type { AppEventMap } from "@/types";
import { sdk } from "@/lib/sdk";
import { SocketEvents } from "@/lib/socket/events";
import { attachSocketSubscriptions } from "@/lib/socket/subscriptions";

export const useCaptionProgress = (options?: { paused?: boolean }) => {
  const paused = options?.paused === true;
  const { socket } = useSocketIO();
  const [progressMap, setProgressMap] = useState<Record<string, CaptionProgress>>({});

  useEffect(() => {
    if (paused) {
      return;
    }
    let cancelled = false;
    const hydrate = async () => {
      try {
        const response = await sdk.content.captionProgress();
        if (cancelled) return;
        setProgressMap((response.items ?? {}) as Record<string, CaptionProgress>);
      } catch {
        // Keep local socket-driven state if snapshot fetch fails.
      }
    };
    void hydrate();
    const onConnect = () => {
      void hydrate();
    };
    socket?.on("connect", onConnect);
    return () => {
      cancelled = true;
      socket?.off("connect", onConnect);
    };
  }, [paused, socket]);

  useEffect(() => {
    if (!socket || paused) {
      return;
    }

    const handleUpdate = (payload: AppEventMap["caption.update"]) => {
      const key = payload.mode && payload.mode.trim().length > 0
        ? `${payload.id}::${payload.mode.trim()}`
        : payload.id;

      if (payload.status === "completed" || payload.status === "failed") {
        setProgressMap((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
        return;
      }

      setProgressMap((current) => ({
        ...current,
        [key]: {
          id: payload.id,
          jobId: payload.jobId,
          mode: payload.mode,
          key,
          status: payload.status === "queued" ? "queued" : "processing",
          progress: payload.progress,
          error: payload.error,
          metadata: payload.metadata ?? undefined,
          updatedAt: Date.now(),
        },
      }));
    };

    return attachSocketSubscriptions(socket, [
      { event: SocketEvents.caption.update, handler: handleUpdate },
      { event: SocketEvents.caption.completed, handler: handleUpdate },
      { event: SocketEvents.caption.failed, handler: handleUpdate },
    ] as const);
  }, [socket, paused]);

  return useMemo(() => progressMap, [progressMap]);
};
