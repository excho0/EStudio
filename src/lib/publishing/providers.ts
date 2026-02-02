import { Youtube } from "lucide-react";

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
  icon: React.ComponentType<{ className?: string }>;
  capabilities: ProviderCapabilities;
  getAssetUrl?: (assetId: string) => string | null;
};

export const PROVIDER_REGISTRY: Record<ProviderKey, ProviderDefinition> = {
  youtube: {
    id: "youtube",
    label: "YouTube",
    icon: Youtube,
    getAssetUrl: (assetId) => (assetId ? `https://youtu.be/${assetId}` : null),
    capabilities: {
      supportsSchedule: true,
      supportsPrivacy: true,
      privacyOptions: ["public", "unlisted", "private"],
      supportsTags: true,
      supportsCategories: true,
    },
  },
};

export const getProviderDefinition = (id: string) =>
  PROVIDER_REGISTRY[id as ProviderKey] ?? null;
