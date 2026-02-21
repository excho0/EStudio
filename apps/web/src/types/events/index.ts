import type { z } from "zod";
import type {
  contentUpdatePayloadSchema,
  captionUpdatePayloadSchema,
  providerConnectionPayloadSchema,
  publishProgressPayloadSchema,
  publishQueuedPayloadSchema,
  publishUpdatePayloadSchema,
  renderCompletePayloadSchema,
  renderProgressPayloadSchema,
  renderQueuedPayloadSchema,
  settingsUpdatedPayloadSchema,
  userProfileUpdatedPayloadSchema,
} from "@/lib/data/events";
import type { renderBackendSchema } from "@/lib/data/render";

export type ContentUpdatePayload = z.infer<typeof contentUpdatePayloadSchema>;
export type RenderBackend = z.infer<typeof renderBackendSchema>;
export type RenderQueuedPayload = z.infer<typeof renderQueuedPayloadSchema>;
export type RenderProgressPayload = z.infer<typeof renderProgressPayloadSchema>;
export type RenderCompletePayload = z.infer<typeof renderCompletePayloadSchema>;
export type PublishUpdatePayload = z.infer<typeof publishUpdatePayloadSchema>;
export type PublishProgressPayload = z.infer<typeof publishProgressPayloadSchema>;
export type PublishQueuedPayload = z.infer<typeof publishQueuedPayloadSchema>;
export type CaptionUpdatePayload = z.infer<typeof captionUpdatePayloadSchema>;
export type ProviderConnectionPayload = z.infer<typeof providerConnectionPayloadSchema>;
export type UserProfileUpdatedPayload = z.infer<typeof userProfileUpdatedPayloadSchema>;
export type SettingsUpdatedPayload = z.infer<typeof settingsUpdatedPayloadSchema>;

export type AppEventMap = {
  "content.update": ContentUpdatePayload;
  "content.created": ContentUpdatePayload;
  "content.updated": ContentUpdatePayload;
  "content.deleted": ContentUpdatePayload;
  "content.status.changed": ContentUpdatePayload;
  "render.queued": RenderQueuedPayload;
  "render.started": ContentUpdatePayload;
  "render.progress": RenderProgressPayload;
  "render.completed": RenderCompletePayload | ContentUpdatePayload;
  "render.failed": ContentUpdatePayload;
  "publish.queued": PublishQueuedPayload | PublishUpdatePayload;
  "publish.started": PublishUpdatePayload;
  "publish.progress": PublishProgressPayload;
  "publish.completed": PublishUpdatePayload;
  "publish.failed": PublishUpdatePayload;
  "publish.update": PublishUpdatePayload;
  "caption.queued": CaptionUpdatePayload;
  "caption.started": CaptionUpdatePayload;
  "caption.completed": CaptionUpdatePayload;
  "caption.failed": CaptionUpdatePayload;
  "caption.update": CaptionUpdatePayload;
  "provider.connection.created": ProviderConnectionPayload;
  "provider.connection.deleted": ProviderConnectionPayload;
  "user.profile.updated": UserProfileUpdatedPayload;
  "settings.updated": SettingsUpdatedPayload;
};
