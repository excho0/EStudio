"use client";

import { useEffect, useMemo, useState } from "react";
import { useSocketIO } from "@/components/studio/socketIO-provider";
import type { AppEventMap, RenderProgress } from "@/types";
import type { CaptionProgress } from "@/lib/data/captions/progress";
import type { PublishProgressSnapshot } from "@/lib/data/publish/progress";
import { sdk } from "@/lib/sdk";
import { SocketEvents } from "@/lib/socket/events";
import { attachSocketSubscriptions } from "@/lib/socket/subscriptions";

export type { RenderProgress } from "@/types";

export const useRenderProgress = (options?: { paused?: boolean }) => {
  const paused = options?.paused === true;
  const { socket } = useSocketIO();
  const [rawProgressMap, setRawProgressMap] = useState<Record<string, RenderProgress>>({});

  const aggregateByContentId = (
    map: Record<string, RenderProgress>
  ): Record<string, RenderProgress> => {
    const grouped = new Map<string, RenderProgress[]>();
    Object.values(map).forEach((entry) => {
      const current = grouped.get(entry.id) ?? [];
      current.push(entry);
      grouped.set(entry.id, current);
    });
    const aggregated: Record<string, RenderProgress> = {};
    grouped.forEach((entries, id) => {
      const best = entries.reduce((max, item) =>
        item.progress > max.progress ? item : max
      );
      aggregated[id] = {
        ...best,
        id,
      };
    });
    return aggregated;
  };

  useEffect(() => {
    if (paused) {
      return;
    }
    let cancelled = false;
    const hydrate = async () => {
      try {
        const response = await sdk.content.progress();
        if (cancelled) return;
        setRawProgressMap(
          (response.items ?? {}) as Record<string, RenderProgress>
        );
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

    const handleProgress = (payload: RenderProgress) => {
      setRawProgressMap((current) => {
        const key = payload.key ?? payload.id;
        return { ...current, [key]: payload };
      });
    };
    const clearProgress = (id: string) => {
      setRawProgressMap((current) => {
        const next = Object.fromEntries(
          Object.entries(current).filter(([, value]) => value.id !== id)
        ) as Record<string, RenderProgress>;
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

    return attachSocketSubscriptions(socket, [
      { event: SocketEvents.render.progress, handler: handleProgress },
      { event: SocketEvents.render.completed, handler: handleComplete },
      { event: SocketEvents.content.update, handler: handleContentUpdate },
      { event: SocketEvents.render.cancelRequested, handler: handleComplete },
    ] as const);
  }, [socket, paused]);

  return useMemo(() => aggregateByContentId(rawProgressMap), [rawProgressMap]);
};

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
