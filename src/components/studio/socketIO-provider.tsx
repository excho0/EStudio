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

type SocketIOContextValue = {
  connected: boolean;
  status: "connecting" | "connected" | "disconnected" | "error";
  eventToken: number;
  metrics: MetricsPayload | null;
  socket: Socket | null;
};

export type MetricsPayload = {
  cpu: {
    load: number | null;
    temperature: number | null;
  };
  memory: {
    usage: number | null;
    totalBytes: number | null;
    usedBytes: number | null;
  };
  gpus: {
    model: string;
    vendor: string | null;
    bus: string | null;
    vramTotalMB: number | null;
    vramUsedMB: number | null;
    vramUsagePct: number | null;
    utilizationGpu: number | null;
    temperatureGpu: number | null;
    fanSpeedPct: number | null;
    powerDrawW: number | null;
    powerLimitW: number | null;
  }[];
};

const SocketIOContext = createContext<SocketIOContextValue | null>(
  null
);

export function SocketIOProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<
    "connecting" | "connected" | "disconnected" | "error"
  >("connecting");
  const [eventToken, setEventToken] = useState(0);
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null);
  const [socket] = useState<Socket>(() => io({ path: "/api/socket" }));
  const registeredUserRef = useRef<string | null>(null);

  useEffect(() => {
    const handleUpdate = () => {
      setEventToken((current) => current + 1);
    };

    const registerUser = async () => {
      if (registeredUserRef.current) return;
      try {
        const response = await fetch("/api/user/profile");
        if (!response.ok) return;
        const payload = (await response.json()) as { user?: { id?: string } };
        const userId = payload.user?.id;
        if (!userId) return;
        registeredUserRef.current = userId;
        socket.emit("user:register", { userId });
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
    socket.on("metrics:update", setMetrics);

    return () => {
      socket.off("content:update", handleUpdate);
      socket.off("metrics:update", setMetrics);
      socket.off("connect_error");
      socket.disconnect();
    };
  }, [socket]);

  const value = useMemo(
    () => ({ connected, status, eventToken, metrics, socket }),
    [connected, status, eventToken, metrics, socket]
  );

  return (
    <SocketIOContext.Provider value={value}>
      {children}
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
