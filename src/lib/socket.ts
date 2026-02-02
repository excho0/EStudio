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

export const emitRenderComplete = (payload: {
  id: string;
  durationSeconds?: number;
  avgFps?: number;
}) => {
  const io = getSocketServer();
  if (io) {
    io.emit("render:complete", payload);
  }
};

export const emitPublishUpdate = (payload: {
  id: string;
  status: string;
  providerAssetId?: string;
  error?: string;
}) => {
  const io = getSocketServer();
  if (io) {
    io.emit("publish:update", payload);
  }
};

export const emitPublishProgress = (payload: {
  id: string;
  stage: string;
  progress?: number;
  bytesUploaded?: number;
  bytesTotal?: number;
}) => {
  const io = getSocketServer();
  if (io) {
    io.emit("publish:progress", {
      id: payload.id,
      stage: payload.stage,
      progress: payload.progress,
    });
  }
};
