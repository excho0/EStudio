import type { ComponentType } from "react";
import type { VariantProps } from "class-variance-authority";
import type { z } from "zod";

import type { badgeVariants } from "@/components/ui/badge";
import type {
  publishMetadataSchema,
  publishOptionsSchema,
  publishProgressSchema,
  publishProviderResponseSchema,
  publishResultSchema,
} from "@/lib/data/publish";

export type PublishMetadata = z.infer<typeof publishMetadataSchema>;
export type PublishOptions = z.infer<typeof publishOptionsSchema>;

export type PublishPayload = {
  userId?: string;
  contentId?: string;
  providerAccountId?: string;
  renderId: string;
  renderKey?: string;
  renderPath?: string;
  thumbnailKey?: string | null;
  thumbnailPath?: string | null;
  metadata: PublishMetadata;
  options?: PublishOptions;
  onProgress?: (progress: PublishProgress) => void;
};

export type PublishResult = z.infer<typeof publishResultSchema>;
export type PublishProgress = z.infer<typeof publishProgressSchema>;

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

export type YoutubeConnection = z.infer<typeof publishProviderResponseSchema>;
