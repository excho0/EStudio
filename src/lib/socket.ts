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

export const emitRenderProgress = (payload: {
  id: string;
  rendered: number;
  total: number;
  progress: number;
  eta?: string;
}) => {
  const io = getSocketServer();
  if (io) {
    io.emit("render:progress", payload);
  }
};

export const emitRenderComplete = (payload: { id: string }) => {
  const io = getSocketServer();
  if (io) {
    io.emit("render:complete", payload);
  }
};
