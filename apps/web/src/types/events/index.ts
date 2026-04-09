import type { z } from "zod";
import type {
  contentUpdatePayloadSchema,
  contentUpdateTypeSchema,
  captionUpdatePayloadSchema,
  metricsSubscribePayloadSchema,
  metricsUnsubscribePayloadSchema,
  metricsUpdateEventPayloadSchema,
  providerConnectionPayloadSchema,
  publishProgressPayloadSchema,
  publishUpdatePayloadSchema,
  renderCancelRequestedPayloadSchema,
  renderCompletedEventPayloadSchema,
  renderCompletePayloadSchema,
  renderProgressPayloadSchema,
  renderQueuedPayloadSchema,
  settingsUpdatedPayloadSchema,
  userRegisterPayloadSchema,
  userProfileUpdatedPayloadSchema,
} from "@/lib/data/events";
import type { renderBackendSchema } from "@/lib/data/render";

export type ContentUpdatePayload = z.infer<typeof contentUpdatePayloadSchema>;
export type ContentUpdateType = z.infer<typeof contentUpdateTypeSchema>;
export type RenderBackend = z.infer<typeof renderBackendSchema>;
export type RenderQueuedPayload = z.infer<typeof renderQueuedPayloadSchema>;
export type RenderProgressPayload = z.infer<typeof renderProgressPayloadSchema>;
export type RenderCompletePayload = z.infer<typeof renderCompletePayloadSchema>;
export type RenderCompletedEventPayload = z.infer<typeof renderCompletedEventPayloadSchema>;
export type RenderCancelRequestedPayload = z.infer<typeof renderCancelRequestedPayloadSchema>;
export type UserRegisterPayload = z.infer<typeof userRegisterPayloadSchema>;
export type MetricsUpdateEventPayload = z.infer<typeof metricsUpdateEventPayloadSchema>;
export type MetricsSubscribePayload = z.infer<typeof metricsSubscribePayloadSchema>;
export type MetricsUnsubscribePayload = z.infer<typeof metricsUnsubscribePayloadSchema>;
export type PublishUpdatePayload = z.infer<typeof publishUpdatePayloadSchema>;
export type PublishProgressPayload = z.infer<typeof publishProgressPayloadSchema>;
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
  "render.completed": RenderCompletedEventPayload;
  "render.failed": ContentUpdatePayload;
  "render.cancel-requested": RenderCancelRequestedPayload;
  "publish.queued": PublishUpdatePayload;
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
