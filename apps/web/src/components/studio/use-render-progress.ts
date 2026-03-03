"use client";

import { useEffect, useMemo, useState } from "react";
import { useSocketIO } from "./socketIO-provider";
import type { RenderProgress } from "@/types";
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
    return () => {
      cancelled = true;
    };
  }, [paused]);

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
