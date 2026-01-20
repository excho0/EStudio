"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";

type DashboardSocketContextValue = {
  connected: boolean;
  eventToken: number;
  socket: Socket | null;
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
  const [socket] = useState<Socket>(() => io({ path: "/api/socket" }));

  useEffect(() => {
    const handleUpdate = () => {
      setEventToken((current) => current + 1);
    };

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("content:update", handleUpdate);

    return () => {
      socket.off("content:update", handleUpdate);
      socket.disconnect();
    };
  }, [socket]);

  const value = useMemo(
    () => ({ connected, eventToken, socket }),
    [connected, eventToken, socket]
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
