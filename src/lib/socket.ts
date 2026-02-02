import type { Server as SocketIOServer } from "socket.io";

type GlobalWithSocket = typeof globalThis & {
  io?: SocketIOServer;
};

export const getSocketServer = () =>
  (globalThis as GlobalWithSocket).io ?? null;

const resolveRoom = (userId?: string | null) =>
  userId ? `user:${userId}` : null;

export const emitContentUpdate = (payload: {
  userId?: string | null;
  type: string;
  id?: string;
  status?: string;
  item?: unknown;
}) => {
  const io = getSocketServer();
  if (!io) return;
  const room = resolveRoom(payload.userId);
  if (room) {
    io.to(room).emit("content:update", payload);
    return;
  }
  io.emit("content:update", payload);
};

export const emitRenderProgress = (payload: {
  userId?: string | null;
  id: string;
  rendered: number;
  total: number;
  progress: number;
  eta?: string;
}) => {
  const io = getSocketServer();
  if (!io) return;
  const room = resolveRoom(payload.userId);
  if (room) {
    io.to(room).emit("render:progress", payload);
    return;
  }
  io.emit("render:progress", payload);
};

export const emitRenderComplete = (payload: {
  userId?: string | null;
  id: string;
  durationSeconds?: number;
  avgFps?: number;
}) => {
  const io = getSocketServer();
  if (!io) return;
  const room = resolveRoom(payload.userId);
  if (room) {
    io.to(room).emit("render:complete", payload);
    return;
  }
  io.emit("render:complete", payload);
};

export const emitPublishUpdate = (payload: {
  userId?: string | null;
  id: string;
  status: string;
  providerAssetId?: string;
  error?: string;
}) => {
  const io = getSocketServer();
  if (!io) return;
  const room = resolveRoom(payload.userId);
  if (room) {
    io.to(room).emit("publish:update", payload);
    return;
  }
  io.emit("publish:update", payload);
};

export const emitPublishProgress = (payload: {
  userId?: string | null;
  id: string;
  stage: string;
  progress?: number;
  bytesUploaded?: number;
  bytesTotal?: number;
}) => {
  const io = getSocketServer();
  if (!io) return;
  const room = resolveRoom(payload.userId);
  const eventPayload = {
    id: payload.id,
    stage: payload.stage,
    progress: payload.progress,
    bytesUploaded: payload.bytesUploaded,
    bytesTotal: payload.bytesTotal,
  };
  if (room) {
    io.to(room).emit("publish:progress", eventPayload);
    return;
  }
  io.emit("publish:progress", eventPayload);
};
