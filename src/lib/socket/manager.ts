import type { Server as SocketIOServer } from "socket.io";
import { eventBus } from "@/lib/event-bus";
import type {
  AppEventMap,
  CaptionUpdatePayload,
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
import { enqueueNotificationPersist } from "@/lib/notifications/persist-queue";

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

const getNotificationKey = (
  kind: "render" | "publish" | "caption",
  id: string,
  mode?: string
) => `${kind}:${id}:${mode?.trim() || "default"}`;

const persistNotification = (payload: {
  userId?: string | null;
  key: string;
  contentId: string;
  mode?: string;
  kind: "render" | "publish" | "caption";
  status: "queued" | "processing" | "publishing" | "rendering" | "completed" | "failed";
  progress?: number;
  stage?: string;
  error?: string;
}) => {
  void enqueueNotificationPersist(payload);
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
      if (payload.id) {
        persistNotification({
          userId: payload.userId,
          key: getNotificationKey("render", payload.id),
          contentId: payload.id,
          kind: "render",
          status: "rendering",
        });
      }
    } else if (payload.status === "rendered") {
      if (payload.id) {
        void clearRenderProgressSnapshotsForContent({
          userId: payload.userId,
          id: payload.id,
        });
      }
      emitDomainEvent("render.completed", typedPayload);
      if (payload.id) {
        persistNotification({
          userId: payload.userId,
          key: getNotificationKey("render", payload.id),
          contentId: payload.id,
          kind: "render",
          status: "completed",
          progress: 1,
        });
      }
    } else if (payload.status === "failed") {
      if (payload.id) {
        void clearRenderProgressSnapshotsForContent({
          userId: payload.userId,
          id: payload.id,
        });
      }
      emitDomainEvent("render.failed", typedPayload);
      if (payload.id) {
        persistNotification({
          userId: payload.userId,
          key: getNotificationKey("render", payload.id),
          contentId: payload.id,
          kind: "render",
          status: "failed",
        });
      }
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
  persistNotification({
    userId: payload.userId,
    key: getNotificationKey("render", payload.id, payload.mode),
    contentId: payload.id,
    mode: payload.mode,
    kind: "render",
    status: "rendering",
    progress: payload.progress,
  });
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
  persistNotification({
    userId: payload.userId,
    key: getNotificationKey("render", payload.id, payload.mode),
    contentId: payload.id,
    mode: payload.mode,
    kind: "render",
    status: "completed",
    progress: 1,
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
  persistNotification({
    userId: payload.userId,
    key: getNotificationKey("publish", payload.id),
    contentId: payload.id,
    kind: "publish",
    status:
      payload.status === "queued"
        ? "queued"
        : payload.status === "publishing"
          ? "publishing"
          : payload.status === "failed"
            ? "failed"
            : "completed",
    progress:
      payload.status === "published" || payload.status === "published_with_warning"
        ? 1
        : undefined,
    error: payload.error,
  });
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
  persistNotification({
    userId: payload.userId,
    key: getNotificationKey("publish", payload.id),
    contentId: payload.id,
    kind: "publish",
    status: "publishing",
    progress: payload.progress,
    stage: payload.stage,
  });
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

export const emitCaptionUpdate = (payload: {
  userId?: string | null;
  id: string;
  mode?: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress?: number;
  error?: string;
}) => {
  persistNotification({
    userId: payload.userId,
    key: getNotificationKey("caption", payload.id, payload.mode),
    contentId: payload.id,
    mode: payload.mode,
    kind: "caption",
    status:
      payload.status === "queued"
        ? "queued"
        : payload.status === "processing"
          ? "processing"
          : payload.status === "failed"
            ? "failed"
            : "completed",
    progress: payload.progress,
    error: payload.error,
  });
  const typedPayload = payload as CaptionUpdatePayload;
  emitDomainEvent("caption.update", typedPayload);
  if (payload.status === "queued") {
    emitDomainEvent("caption.queued", typedPayload);
  } else if (payload.status === "processing") {
    emitDomainEvent("caption.started", typedPayload);
  } else if (payload.status === "completed") {
    emitDomainEvent("caption.completed", typedPayload);
  } else if (payload.status === "failed") {
    emitDomainEvent("caption.failed", typedPayload);
  }
  const io = getSocketServer();
  if (!io) return;
  const room = resolveRoom(payload.userId);
  if (room) {
    io.to(room).emit("caption:update", payload);
    return;
  }
  io.emit("caption:update", payload);
};

export {
  clearRenderProgressSnapshot,
  clearRenderProgressSnapshotsForContent,
  getRenderProgressSnapshot,
};
