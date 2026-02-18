import type { Server as SocketIOServer } from "socket.io";
import { eventBus } from "@/lib/event-bus";
import type {
  AppEventMap,
  ContentUpdatePayload,
  PublishProgressPayload,
  PublishUpdatePayload,
  RenderCompletePayload,
  RenderProgressPayload,
} from "@/types";
import {
  clearRenderProgressSnapshotsForContent,
  clearRenderProgressSnapshot,
  getRenderProgressSnapshot,
  setRenderProgressSnapshot,
} from "@/lib/rendering/progress-store";

type GlobalWithSocket = typeof globalThis & {
  io?: SocketIOServer;
};

const resolveRoom = (userId?: string | null) => (userId ? `user:${userId}` : null);
const emitDomainEvent = <TTopic extends keyof AppEventMap>(
  topic: TTopic,
  payload: AppEventMap[TTopic]
) => {
  void eventBus.emit(topic, payload);
};

export const getSocketServer = () => (globalThis as GlobalWithSocket).io ?? null;

export const emitContentUpdate = (payload: {
  userId?: string | null;
  type: string;
  id?: string;
  status?: string;
  item?: unknown;
}) => {
  const typedPayload = payload as ContentUpdatePayload;
  emitDomainEvent("content.update", typedPayload);
  if (payload.type === "content:created") {
    emitDomainEvent("content.created", typedPayload);
  } else if (payload.type === "content:updated") {
    emitDomainEvent("content.updated", typedPayload);
  } else if (payload.type === "content:deleted") {
    emitDomainEvent("content.deleted", typedPayload);
  } else if (payload.type === "content:status") {
    emitDomainEvent("content.status.changed", typedPayload);
    if (payload.status === "rendering") {
      emitDomainEvent("render.started", typedPayload);
    } else if (payload.status === "rendered") {
      emitDomainEvent("render.completed", typedPayload);
    } else if (payload.status === "failed") {
      emitDomainEvent("render.failed", typedPayload);
    }
  }
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
  mode?: string;
  key?: string;
  rendered: number;
  total: number;
  progress: number;
  eta?: string;
}) => {
  void setRenderProgressSnapshot(payload);
  emitDomainEvent("render.progress", payload as RenderProgressPayload);
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
  mode?: string;
  key?: string;
  durationSeconds?: number;
  avgFps?: number;
}) => {
  void clearRenderProgressSnapshot({
    userId: payload.userId,
    id: payload.id,
    mode: payload.mode,
    key: payload.key,
  });
  emitDomainEvent("render.completed", payload as RenderCompletePayload);
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
  const typedPayload = payload as PublishUpdatePayload;
  emitDomainEvent("publish.update", typedPayload);
  if (payload.status === "publishing") {
    emitDomainEvent("publish.started", typedPayload);
  } else if (payload.status === "failed") {
    emitDomainEvent("publish.failed", typedPayload);
  } else if (payload.status === "published" || payload.status === "published_with_warning") {
    emitDomainEvent("publish.completed", typedPayload);
  } else if (payload.status === "queued") {
    emitDomainEvent("publish.queued", typedPayload);
  }
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
  emitDomainEvent("publish.progress", payload as PublishProgressPayload);
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

export {
  clearRenderProgressSnapshot,
  clearRenderProgressSnapshotsForContent,
  getRenderProgressSnapshot,
};
