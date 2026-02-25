"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { io, type Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/http/query-keys";
import { sdk } from "@/lib/sdk";
import type { MetricsPayload } from "@/types";
import { toast } from "sonner";
import { notifyRenderComplete } from "@/lib/notifications";

type SocketIOContextValue = {
  connected: boolean;
  status: "connecting" | "connected" | "disconnected" | "error";
  eventToken: number;
  socket: Socket | null;
};

const SocketIOContext = createContext<SocketIOContextValue | null>(null);
const MetricsContext = createContext<MetricsPayload | null>(null);
const COMPLETION_SOUND_SRC = "/sounds/render-complete.mp3";

type WindowWithSocket = Window & {
  __appSocket?: Socket;
  __realtimeToastStartedKeys?: Set<string>;
  __realtimeToastCompletedKeys?: Set<string>;
};

const getBrowserSocket = () => {
  if (typeof window === "undefined") {
    return null;
  }
  const win = window as WindowWithSocket;
  if (!win.__appSocket) {
    win.__appSocket = io({
      path: "/api/socket",
      autoConnect: true,
      addTrailingSlash: false,
      transports: ["websocket", "polling"],
    });
  }
  return win.__appSocket;
};

const getStartedKeys = () => {
  if (typeof window === "undefined") return null;
  const win = window as WindowWithSocket;
  if (!win.__realtimeToastStartedKeys) {
    win.__realtimeToastStartedKeys = new Set<string>();
  }
  return win.__realtimeToastStartedKeys;
};

const getCompletedKeys = () => {
  if (typeof window === "undefined") return null;
  const win = window as WindowWithSocket;
  if (!win.__realtimeToastCompletedKeys) {
    win.__realtimeToastCompletedKeys = new Set<string>();
  }
  return win.__realtimeToastCompletedKeys;
};

const shortId = (id: string) => id.slice(0, 8);

export function SocketIOProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const socket = useMemo(() => getBrowserSocket(), []);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected" | "error">(
    "connecting"
  );
  const [eventToken, setEventToken] = useState(0);
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null);
  const registeredUserRef = useRef<string | null>(null);
  const registeredForSocketRef = useRef<string | null>(null);
  const socketIdRef = useRef<string | null>(null);
  const contentTitlesRef = useRef<Map<string, string>>(new Map());
  const titleFetchesRef = useRef<Map<string, Promise<string | null>>>(new Map());

  useEffect(() => {
    if (!socket) {
      return;
    }
    const handleUpdate = () => {
      setEventToken((current) => current + 1);
      queryClient.invalidateQueries({ queryKey: queryKeys.contentListBase });
    };

    const resolveContentLabel = async (id: string) => {
      const cached = contentTitlesRef.current.get(id);
      if (cached) {
        return cached;
      }
      const inflight = titleFetchesRef.current.get(id);
      if (inflight) {
        const resolved = await inflight;
        return resolved ?? `#${shortId(id)}`;
      }
      const request = sdk.content
        .get(id)
        .then((item) => {
          const title = item.title?.trim();
          if (title) {
            contentTitlesRef.current.set(id, title);
            return title;
          }
          return null;
        })
        .catch(() => null)
        .finally(() => {
          titleFetchesRef.current.delete(id);
        });
      titleFetchesRef.current.set(id, request);
      const resolved = await request;
      return resolved ?? `#${shortId(id)}`;
    };

    const notifyStarted = async (key: string, label: string, id: string, mode?: string) => {
      const started = getStartedKeys();
      if (started?.has(key)) return;
      started?.add(key);
      const modeSuffix = mode ? ` · ${mode}` : "";
      const contentLabel = await resolveContentLabel(id);
      toast.message(`${label} started · ${contentLabel}${modeSuffix}`);
    };

    const notifyCompleted = async (key: string, label: string, id: string, mode?: string) => {
      const completed = getCompletedKeys();
      if (completed?.has(key)) return;
      completed?.add(key);
      const modeSuffix = mode ? ` · ${mode}` : "";
      const contentLabel = await resolveContentLabel(id);
      const message = `${label} completed · ${contentLabel}${modeSuffix}`;
      toast.success(message);
      notifyRenderComplete(`${label} complete`, message);
      const audio = new Audio(COMPLETION_SOUND_SRC);
      void audio.play().catch(() => undefined);
    };

    const registerUser = async () => {
      try {
        const payload = await sdk.user.profile();
        const userId = payload.id;
        if (!userId) return;
        registeredUserRef.current = userId;
        if (
          registeredForSocketRef.current === userId &&
          socketIdRef.current === socket.id
        ) {
          return;
        }
        socket.emit("user:register", { userId });
        registeredForSocketRef.current = userId;
        socketIdRef.current = socket.id ?? null;
      } catch {
        // Ignore registration failures; socket will still connect.
      }
    };

    socket.on("connect", () => {
      setConnected(true);
      setStatus("connected");
      void registerUser();
    });
    socket.on("disconnect", () => {
      setConnected(false);
      setStatus("disconnected");
    });
    socket.on("connect_error", () => {
      setConnected(false);
      setStatus("error");
    });
    socket.on("content:update", handleUpdate);
    socket.on("publish:update", () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.publishesBase });
      queryClient.invalidateQueries({ queryKey: queryKeys.contentListBase });
    });
    socket.on("render:update", () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rendersBase });
    });
    socket.on("settings:updated", () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings });
    });
    socket.on("metrics:update", setMetrics);

    const handleRenderProgressToast = (payload: {
      id: string;
      jobId?: string;
      mode?: string;
      progress?: number;
      rendered?: number;
      total?: number;
    }) => {
      const key = payload.jobId ?? `${payload.id}:${payload.mode ?? "default"}`;
      const progressValue = Number.isFinite(payload.progress ?? NaN)
        ? Number(payload.progress)
        : 0;
      const normalizedProgress = progressValue > 1 ? progressValue / 100 : progressValue;
      const rendered = Number.isFinite(payload.rendered ?? NaN)
        ? Number(payload.rendered)
        : null;
      const total = Number.isFinite(payload.total ?? NaN) ? Number(payload.total) : null;
      const isCompleted =
        normalizedProgress >= 1 ||
        (rendered !== null && total !== null && total > 0 && rendered >= total);
      if (isCompleted) {
        void notifyCompleted(`render:${key}`, "Render", payload.id, payload.mode);
        return;
      }
      if (normalizedProgress > 0 && normalizedProgress <= 0.02) {
        void notifyStarted(`render:${key}`, "Render", payload.id, payload.mode);
      }
    };

    const handleRenderCompleteToast = (payload: {
      id: string;
      jobId?: string;
      mode?: string;
    }) => {
      const key = payload.jobId ?? `${payload.id}:${payload.mode ?? "default"}`;
      void notifyCompleted(`render:${key}`, "Render", payload.id, payload.mode);
    };

    const handlePublishUpdateToast = (payload: {
      id: string;
      jobId?: string;
      status?: string;
    }) => {
      const key = payload.jobId ?? payload.id;
      if (payload.status === "queued" || payload.status === "publishing") {
        void notifyStarted(`publish:${key}`, "Publish", payload.id);
      } else if (payload.status === "published" || payload.status === "published_with_warning") {
        void notifyCompleted(`publish:${key}`, "Publish", payload.id);
      }
    };

    const handleCaptionUpdateToast = (payload: {
      id: string;
      jobId?: string;
      mode?: string;
      status?: "queued" | "processing" | "completed" | "failed";
    }) => {
      const key = payload.jobId ?? `${payload.id}:${payload.mode ?? "default"}`;
      if (payload.status === "queued") {
        void notifyStarted(`caption:${key}`, "Captions", payload.id, payload.mode);
      } else if (payload.status === "completed") {
        void notifyCompleted(`caption:${key}`, "Captions", payload.id, payload.mode);
      }
    };

    const handleRenderCancelRequestedToast = (payload: {
      id: string;
      jobId?: string;
      mode?: string;
    }) => {
      const key = payload.jobId ?? `${payload.id}:${payload.mode ?? "default"}`;
      const started = getStartedKeys();
      const toastKey = `render-cancel:${key}`;
      if (started?.has(toastKey)) return;
      started?.add(toastKey);
      const modeSuffix = payload.mode ? ` · ${payload.mode}` : "";
      void resolveContentLabel(payload.id).then((contentLabel) => {
        toast.message(`Render cancel requested · ${contentLabel}${modeSuffix}`);
      });
    };

    socket.on("render:progress", handleRenderProgressToast);
    socket.on("render:complete", handleRenderCompleteToast);
    socket.on("publish:update", handlePublishUpdateToast);
    socket.on("caption:update", handleCaptionUpdateToast);
    socket.on("render:cancel-requested", handleRenderCancelRequestedToast);

    return () => {
      socket.off("content:update", handleUpdate);
      socket.off("publish:update");
      socket.off("render:update");
      socket.off("settings:updated");
      socket.off("metrics:update", setMetrics);
      socket.off("connect_error");
      socket.off("render:progress", handleRenderProgressToast);
      socket.off("render:complete", handleRenderCompleteToast);
      socket.off("publish:update", handlePublishUpdateToast);
      socket.off("caption:update", handleCaptionUpdateToast);
      socket.off("render:cancel-requested", handleRenderCancelRequestedToast);
    };
  }, [queryClient, socket]);

  const value = useMemo(
    () => ({ connected, status, eventToken, socket }),
    [connected, status, eventToken, socket]
  );

  return (
    <SocketIOContext.Provider value={value}>
      <MetricsContext.Provider value={metrics}>
        {children}
      </MetricsContext.Provider>
    </SocketIOContext.Provider>
  );
}

export function useSocketIO() {
  const context = useContext(SocketIOContext);
  if (!context) {
    throw new Error("useSocketIO must be used within SocketIOProvider.");
  }
  return context;
}

export function useOptionalSocketIO() {
  return useContext(SocketIOContext);
}

export function useSocketMetrics() {
  return useContext(MetricsContext);
}
