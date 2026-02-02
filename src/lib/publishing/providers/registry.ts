import type { ComponentType } from "react";
import type { VariantProps } from "class-variance-authority";

import type { badgeVariants } from "@/components/ui/badge";
import { youtubeProviderDefinition } from "@/lib/publishing/providers/youtube/registry";

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

export const PROVIDER_REGISTRY: Record<ProviderKey, ProviderDefinition> = {
  youtube: youtubeProviderDefinition,
};

export const getProviderDefinition = (id: string) =>
  PROVIDER_REGISTRY[id as ProviderKey] ?? null;
