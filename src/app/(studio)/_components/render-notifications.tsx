"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useDashboardSocket } from "./dashboard-socket";
import { notifyRenderComplete } from "@/lib/notifications";

const COMPLETION_SOUND_SRC = "/sounds/render-complete.mp3";

export const RenderNotifications = () => {
  const { socket } = useDashboardSocket();
  const playedRef = useRef(new Set<string>());

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleComplete = (payload: { id: string }) => {
      if (playedRef.current.has(payload.id)) {
        return;
      }
      playedRef.current.add(payload.id);
      const message = "Render complete.";
      toast.success(message);
      notifyRenderComplete("Render complete", message);
      const audio = new Audio(COMPLETION_SOUND_SRC);
      void audio.play().catch(() => undefined);
    };

    socket.on("render:complete", handleComplete);
    return () => {
      socket.off("render:complete", handleComplete);
    };
  }, [socket]);

  return null;
};
