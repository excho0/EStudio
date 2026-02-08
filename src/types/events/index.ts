export type ContentUpdatePayload = {
  userId?: string | null;
  type: string;
  id?: string;
  status?: string;
  item?: unknown;
};

export type RenderProgressPayload = {
  userId?: string | null;
  id: string;
  rendered: number;
  total: number;
  progress: number;
  eta?: string;
};

export type RenderCompletePayload = {
  userId?: string | null;
  id: string;
  durationSeconds?: number;
  avgFps?: number;
};

export type PublishUpdatePayload = {
  userId?: string | null;
  id: string;
  status: string;
  providerAssetId?: string;
  error?: string;
};

export type PublishProgressPayload = {
  userId?: string | null;
  id: string;
  stage: string;
  progress?: number;
  bytesUploaded?: number;
  bytesTotal?: number;
};

export type PublishQueuedPayload = {
  userId: string;
  id: string;
  contentId: string;
  provider: string;
};

export type ProviderConnectionPayload = {
  userId: string;
  provider: string;
  providerAccountId?: string | null;
};

export type UserProfileUpdatedPayload = {
  userId: string;
  name: string;
  email: string;
  pendingEmail: string | null;
};

export type AppEventMap = {
  "content.update": ContentUpdatePayload;
  "content.created": ContentUpdatePayload;
  "content.updated": ContentUpdatePayload;
  "content.deleted": ContentUpdatePayload;
  "content.status.changed": ContentUpdatePayload;
  "render.queued": { userId: string; id: string };
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
  "provider.connection.created": ProviderConnectionPayload;
  "provider.connection.deleted": ProviderConnectionPayload;
  "user.profile.updated": UserProfileUpdatedPayload;
};
