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
import { queryKeys } from "@/lib/query-keys";
import type { MetricsPayload } from "@/types";

type SocketIOContextValue = {
  connected: boolean;
  status: "connecting" | "connected" | "disconnected" | "error";
  eventToken: number;
  socket: Socket | null;
};

const SocketIOContext = createContext<SocketIOContextValue | null>(null);
const MetricsContext = createContext<MetricsPayload | null>(null);

export function SocketIOProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<
    "connecting" | "connected" | "disconnected" | "error"
  >("connecting");
  const [eventToken, setEventToken] = useState(0);
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null);
  const [socket] = useState<Socket>(() => io({ path: "/api/socket" }));
  const registeredUserRef = useRef<string | null>(null);
  const registeredForSocketRef = useRef<string | null>(null);
  const socketIdRef = useRef<string | null>(null);

  useEffect(() => {
    const handleUpdate = () => {
      setEventToken((current) => current + 1);
      queryClient.invalidateQueries({ queryKey: queryKeys.contentListBase });
    };

    const registerUser = async () => {
      try {
        const response = await fetch("/api/user/profile");
        if (!response.ok) return;
        const payload = (await response.json()) as {
          id?: string;
          user?: { id?: string };
        };
        const userId = payload.user?.id ?? payload.id;
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
    socket.on("metrics:update", setMetrics);

    return () => {
      socket.off("content:update", handleUpdate);
      socket.off("publish:update");
      socket.off("render:update");
      socket.off("metrics:update", setMetrics);
      socket.off("connect_error");
      socket.disconnect();
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

export function useSocketMetrics() {
  return useContext(MetricsContext);
}
