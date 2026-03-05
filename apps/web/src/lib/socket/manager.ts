import { eventBus } from "@/lib/event-bus";
import type {
  AppEventMap,
  CaptionUpdatePayload,
  PublishProgressPayload,
  PublishUpdatePayload,
  RenderCompletePayload,
  RenderProgressPayload,
  SettingsUpdatedPayload,
} from "@/types";
import {
  clearRenderProgressSnapshotsForContent,
  clearRenderProgressSnapshot,
  getRenderProgressSnapshot,
  setRenderProgressSnapshot,
} from "@/lib/rendering/progress-store";
import {
  enqueueNotificationPersist,
  type NotificationPersistPayload,
} from "@/lib/notifications/persist-queue";

type RenderQueuedEmitterPayload = AppEventMap["render.queued"];
type RenderProgressEmitterPayload = RenderProgressPayload;
type RenderCompleteEmitterPayload = RenderCompletePayload;
type RenderCancelRequestedEmitterPayload = AppEventMap["render.cancel-requested"];
type PublishUpdateEmitterPayload = PublishUpdatePayload;
type PublishProgressEmitterPayload = PublishProgressPayload;
type CaptionUpdateEmitterPayload = CaptionUpdatePayload;
type SettingsUpdatedEmitterPayload = SettingsUpdatedPayload;
const emitDomainEvent = <TTopic extends keyof AppEventMap>(
  topic: TTopic,
  payload: AppEventMap[TTopic]
) => {
  void eventBus.emit(topic, payload);
};

const getNotificationKey = (
  kind: "render" | "publish" | "caption",
  id: string,
  mode?: string,
  jobId?: string
) => (jobId ? `${kind}:${jobId}` : `${kind}:${id}:${mode?.trim() || "default"}`);

const persistNotification = (payload: NotificationPersistPayload) => {
  void enqueueNotificationPersist(payload);
};

export const emitContentUpdate = (payload: AppEventMap["content.update"]) => {
  emitDomainEvent("content.update", payload);
  if (payload.type === "content.created") {
    emitDomainEvent("content.created", payload);
  } else if (payload.type === "content.updated") {
    emitDomainEvent("content.updated", payload);
  } else if (payload.type === "content.deleted") {
    emitDomainEvent("content.deleted", payload);
  } else if (payload.type === "content.status") {
    emitDomainEvent("content.status.changed", payload);
    const hasRenderJobContext = typeof payload.jobId === "string" && payload.jobId.length > 0;

    if (payload.status === "rendering") {
      if (!hasRenderJobContext) {
        // Status-only updates without a render job context should not trigger render lifecycle events.
      } else {
        emitDomainEvent("render.started", payload);
      }
      if (payload.id) {
        persistNotification({
          userId: payload.userId,
          key: getNotificationKey("render", payload.id, undefined, payload.jobId),
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
      if (hasRenderJobContext) {
        emitDomainEvent("render.completed", payload);
      }
      if (payload.id && hasRenderJobContext) {
        persistNotification({
          userId: payload.userId,
          key: getNotificationKey("render", payload.id, undefined, payload.jobId),
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
      if (hasRenderJobContext) {
        emitDomainEvent("render.failed", payload);
      }
      if (payload.id && hasRenderJobContext) {
        persistNotification({
          userId: payload.userId,
          key: getNotificationKey("render", payload.id, undefined, payload.jobId),
          contentId: payload.id,
          kind: "render",
          status: "failed",
        });
      }
    }
  }
};

export const emitRenderQueued = (payload: RenderQueuedEmitterPayload) => {
  persistNotification({
    userId: payload.userId,
    key: getNotificationKey("render", payload.id, payload.mode, payload.jobId),
    contentId: payload.id,
    mode: payload.mode,
    kind: "render",
    status: "queued",
    progress: 0,
    stage: "Queued",
    metadata: payload.metadata,
  });
  emitDomainEvent("render.queued", payload);
};

export const emitRenderProgress = (payload: RenderProgressEmitterPayload) => {
  void setRenderProgressSnapshot(payload);
  persistNotification({
    userId: payload.userId,
    key: getNotificationKey("render", payload.id, payload.mode, payload.jobId),
    contentId: payload.id,
    mode: payload.mode,
    kind: "render",
    status: "rendering",
    progress: payload.progress,
    metadata: payload.metadata,
  });
  emitDomainEvent("render.progress", payload);
};

export const emitRenderComplete = (payload: RenderCompleteEmitterPayload) => {
  void clearRenderProgressSnapshot({
    userId: payload.userId,
    id: payload.id,
    mode: payload.mode,
    key: payload.key,
  });
  persistNotification({
    userId: payload.userId,
    key: getNotificationKey("render", payload.id, payload.mode, payload.jobId),
    contentId: payload.id,
    mode: payload.mode,
    kind: "render",
    status: "completed",
    progress: 1,
    metadata: payload.metadata,
  });
  emitDomainEvent("render.completed", payload);
};

export const emitRenderCancelRequested = (
  payload: RenderCancelRequestedEmitterPayload
) => {
  emitDomainEvent("render.cancel-requested", payload);
  persistNotification({
    userId: payload.userId,
    key: getNotificationKey("render", payload.id, payload.mode, payload.jobId),
    contentId: payload.id,
    mode: payload.mode,
    kind: "render",
    status: "canceled",
    progress: 1,
    stage: "Canceled",
  });
};

export const emitPublishUpdate = (payload: PublishUpdateEmitterPayload) => {
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
    key: getNotificationKey("publish", payload.id, undefined, payload.jobId),
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
    metadata: payload.metadata,
  });
};

export const emitPublishProgress = (payload: PublishProgressEmitterPayload) => {
  persistNotification({
    userId: payload.userId,
    key: getNotificationKey("publish", payload.id, undefined, payload.jobId),
    contentId: payload.id,
    kind: "publish",
    status: "publishing",
    progress: payload.progress,
    stage: payload.stage,
    metadata: payload.metadata,
  });
  emitDomainEvent("publish.progress", payload);
};

export const emitCaptionUpdate = (payload: CaptionUpdateEmitterPayload) => {
  persistNotification({
    userId: payload.userId,
    key: getNotificationKey("caption", payload.id, payload.mode, payload.jobId),
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
    metadata: payload.metadata,
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
};

export const emitSettingsUpdated = (payload: SettingsUpdatedEmitterPayload) => {
  emitDomainEvent("settings.updated", payload);
};

export {
  clearRenderProgressSnapshot,
  clearRenderProgressSnapshotsForContent,
  getRenderProgressSnapshot,
};
