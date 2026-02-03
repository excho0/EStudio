import type { ComponentType } from "react";
import type { VariantProps } from "class-variance-authority";

import type { badgeVariants } from "@/components/ui/badge";

export type PublishMetadata = {
  title: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
};

export type PublishOptions = {
  privacy?: "public" | "unlisted" | "private";
  scheduleAt?: string | null;
};

export type PublishPayload = {
  userId?: string;
  contentId?: string;
  renderId: string;
  renderKey?: string;
  renderPath?: string;
  thumbnailKey?: string | null;
  thumbnailPath?: string | null;
  metadata: PublishMetadata;
  options?: PublishOptions;
  onProgress?: (progress: PublishProgress) => void;
};

export type PublishResult = {
  providerAssetId: string;
  providerUrl?: string;
  status?: "queued" | "publishing" | "published" | "failed" | "published_with_warning";
  warning?: string;
};

export type PublishProgress = {
  stage: "uploading" | "processing" | "thumbnail" | "complete";
  progress?: number;
  bytesUploaded?: number;
  bytesTotal?: number;
};

export type ProviderKey = "youtube";

export type ProviderCapabilities = {
  supportsSchedule: boolean;
  supportsPrivacy: boolean;
  privacyOptions?: Array<"public" | "unlisted" | "private">;
  supportsTags?: boolean;
  supportsCategories?: boolean;
};

export type ProviderDefinition = {
  id: ProviderKey;
  label: string;
  icon: ComponentType<{ className?: string }>;
  capabilities: ProviderCapabilities;
  oauthProviderId?: string;
  oauthProviderName?: string;
  oauthAuthorizationParams?: Record<string, string>;
  badgeVariant?: VariantProps<typeof badgeVariants>["variant"];
  connectionEndpoint?: string;
  getAssetUrl?: (assetId: string) => string | null;
};

export type ProviderDefinitionServer = ProviderDefinition & {
  getConnection?: (userId: string) => Promise<{
    connected: boolean;
    needsReconnect?: boolean;
    channel?: {
      id?: string | null;
      title?: string | null;
      thumbnail?: string | null;
    } | null;
  }>;
  getAvatar?: (userId: string) => Promise<
    | { buffer: Buffer; contentType: string }
    | { error: string; status?: number }
    | null
  >;
  clearCache?: (userId: string) => Promise<void>;
};

export type ProviderAdapter = {
  id: ProviderKey;
  upload: (payload: PublishPayload) => Promise<PublishResult>;
  deleteAsset?: (payload: {
    userId: string;
    providerAssetId: string;
  }) => Promise<void>;
  updateMetadata?: (providerAssetId: string, payload: PublishPayload) => Promise<void>;
  getStatus?: (providerAssetId: string) => Promise<
    "queued" | "publishing" | "published" | "failed" | "published_with_warning"
  >;
};

export type YoutubeConnection = {
  connected: boolean;
  needsReconnect?: boolean;
  channel?: {
    id?: string | null;
    title?: string | null;
    thumbnail?: string | null;
  } | null;
};
