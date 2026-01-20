"use client";

import { useEffect, useState } from "react";
import { useDashboardSocket } from "./dashboard-socket";

export type RenderProgress = {
  id: string;
  rendered: number;
  total: number;
  progress: number;
  eta?: string;
};

export const useRenderProgress = () => {
  const { socket } = useDashboardSocket();
  const [progressMap, setProgressMap] = useState<Record<string, RenderProgress>>({});

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
