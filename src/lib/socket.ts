import type { Server as SocketIOServer } from "socket.io";

type GlobalWithSocket = typeof globalThis & {
  io?: SocketIOServer;
};

export const getSocketServer = () =>
  (globalThis as GlobalWithSocket).io ?? null;

export const emitContentUpdate = (payload: {
  type: string;
  id?: string;
  status?: string;
  item?: unknown;
}) => {
  const io = getSocketServer();
  if (io) {
    io.emit("content:update", payload);
  }
};
