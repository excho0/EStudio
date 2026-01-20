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
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const socketInstance = io({ path: "/api/socket" });

    const handleUpdate = () => {
      setEventToken((current) => current + 1);
    };

    socketInstance.on("connect", () => setConnected(true));
    socketInstance.on("disconnect", () => setConnected(false));
    socketInstance.on("content:update", handleUpdate);
    setSocket(socketInstance);

    return () => {
      socketInstance.off("content:update", handleUpdate);
      socketInstance.disconnect();
      setSocket(null);
    };
  }, []);

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
