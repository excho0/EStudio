"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useDashboardSocket } from "./dashboard-socket";
import { notifyRenderComplete } from "@/lib/notifications";

const COMPLETION_SOUND_SRC = "/sounds/render-complete.mp3";

export const RenderNotifications = () => {
  const { socket } = useDashboardSocket();
  const playedRef = useRef(new Set<string>());
  const lastProgressRef = useRef<Record<string, number>>({});
  const pendingRef = useRef(new Set<string>());
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleProgress = (payload: {
      id: string;
      rendered: number;
      total: number;
      progress: number;
    }) => {
      const lastProgress = lastProgressRef.current[payload.id] ?? 0;
      if (payload.progress < 1 && lastProgress >= 1) {
        playedRef.current.delete(payload.id);
      }
      lastProgressRef.current[payload.id] = payload.progress;
      const isComplete =
        payload.progress >= 1 ||
        (payload.total > 0 && payload.rendered >= payload.total);
      if (!isComplete || playedRef.current.has(payload.id)) {
        return;
      }
      playedRef.current.add(payload.id);
      pendingRef.current.add(payload.id);
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        const completedIds = Array.from(pendingRef.current);
        pendingRef.current.clear();
        if (completedIds.length === 0) {
          return;
        }
        const message =
          completedIds.length === 1
            ? "Render complete."
            : `${completedIds.length} renders completed.`;
        toast.success(message);
        notifyRenderComplete("Render complete", message);
        const audio = new Audio(COMPLETION_SOUND_SRC);
        void audio.play().catch(() => undefined);
      }, 1500);
    };

    socket.on("render:progress", handleProgress);
    return () => {
      socket.off("render:progress", handleProgress);
    };
  }, [socket]);

  return null;
};
