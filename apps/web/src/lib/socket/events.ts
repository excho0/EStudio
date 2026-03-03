import type { AppEventMap, MetricsPayload } from "@/types";

export const SocketEvents = {
  connect: "connect",
  disconnect: "disconnect",
  connectError: "connect_error",
  metricsUpdate: "metrics.update",
  userRegister: "user.register",
  content: {
    update: "content.update",
    created: "content.created",
    updated: "content.updated",
    deleted: "content.deleted",
    statusChanged: "content.status.changed",
  },
  render: {
    queued: "render.queued",
    started: "render.started",
    progress: "render.progress",
    completed: "render.completed",
    failed: "render.failed",
    cancelRequested: "render.cancel-requested",
  },
  publish: {
    update: "publish.update",
    queued: "publish.queued",
    started: "publish.started",
    progress: "publish.progress",
    completed: "publish.completed",
    failed: "publish.failed",
  },
  caption: {
    update: "caption.update",
    queued: "caption.queued",
    started: "caption.started",
    completed: "caption.completed",
    failed: "caption.failed",
  },
  providerConnection: {
    created: "provider.connection.created",
    deleted: "provider.connection.deleted",
  },
  userProfile: {
    updated: "user.profile.updated",
  },
  settings: {
    updated: "settings.updated",
  },
} as const;

export type SocketEventPayloadMap = AppEventMap & {
  connect: undefined;
  disconnect: string;
  connect_error: Error;
  "metrics.update": MetricsPayload;
  "user.register": { userId: string };
  "render.cancel-requested": { id: string; jobId?: string; mode?: string };
};
