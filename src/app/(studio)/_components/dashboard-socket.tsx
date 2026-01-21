"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";

type DashboardSocketContextValue = {
  connected: boolean;
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

const DashboardSocketContext = createContext<DashboardSocketContextValue | null>(
  null
);

export function DashboardSocketProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [connected, setConnected] = useState(false);
  const [eventToken, setEventToken] = useState(0);
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null);
  const [socket] = useState<Socket>(() => io({ path: "/api/socket" }));

  useEffect(() => {
    const handleUpdate = () => {
      setEventToken((current) => current + 1);
    };

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("content:update", handleUpdate);
    socket.on("metrics:update", setMetrics);

    return () => {
      socket.off("content:update", handleUpdate);
      socket.off("metrics:update", setMetrics);
      socket.disconnect();
    };
  }, [socket]);

  const value = useMemo(
    () => ({ connected, eventToken, metrics, socket }),
    [connected, eventToken, metrics, socket]
  );

  return (
    <DashboardSocketContext.Provider value={value}>
      {children}
    </DashboardSocketContext.Provider>
  );
}

export function useDashboardSocket() {
  const context = useContext(DashboardSocketContext);
  if (!context) {
    throw new Error("useDashboardSocket must be used within DashboardSocketProvider.");
  }
  return context;
}
