"use client";

import { useEffect, useMemo, useState } from "react";
import type { AppEventMap } from "@/types";
import { SocketEvents } from "@/lib/socket/events";
import { attachSocketSubscriptions } from "@/lib/socket/subscriptions";
import { sdk } from "@/lib/sdk";
import { useSocketIO } from "./socketIO-provider";
import type { PublishProgressSnapshot } from "@/lib/data/publish/progress";

export const usePublishProgress = (options?: { paused?: boolean }) => {
  const paused = options?.paused === true;
  const { socket } = useSocketIO();
  const [progressMap, setProgressMap] = useState<Record<string, PublishProgressSnapshot>>({});

  useEffect(() => {
    if (paused) {
      return;
    }
    let cancelled = false;
    const hydrate = async () => {
      try {
        const response = await sdk.content.publishProgress();
        if (cancelled) return;
        setProgressMap((response.items ?? {}) as Record<string, PublishProgressSnapshot>);
      } catch {
        // keep socket-driven state if fetch fails
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
    if (!socket || paused) return;

    const handleUpdate = (payload: AppEventMap["publish.update"]) => {
      if (!payload.jobId) return;
      const jobId = payload.jobId;
      const key = `publish:${jobId}`;
      if (payload.status === "failed" || payload.status === "published" || payload.status === "published_with_warning") {
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
          jobId,
          key,
          status: payload.status === "queued" ? "queued" : "publishing",
          error: payload.error,
          metadata: payload.metadata ?? undefined,
          updatedAt: Date.now(),
        },
      }));
    };

    const handleProgress = (payload: AppEventMap["publish.progress"]) => {
      if (!payload.jobId) return;
      const jobId = payload.jobId;
      const key = `publish:${jobId}`;
      setProgressMap((current) => ({
        ...current,
        [key]: {
          id: payload.id,
          jobId,
          key,
          status: "publishing",
          progress: payload.progress,
          stage: payload.stage,
          metadata: payload.metadata ?? undefined,
          updatedAt: Date.now(),
        },
      }));
    };

    return attachSocketSubscriptions(socket, [
      { event: SocketEvents.publish.update, handler: handleUpdate },
      { event: SocketEvents.publish.progress, handler: handleProgress },
      { event: SocketEvents.publish.completed, handler: handleUpdate },
      { event: SocketEvents.publish.failed, handler: handleUpdate },
    ] as const);
  }, [paused, socket]);

  return useMemo(() => progressMap, [progressMap]);
};
