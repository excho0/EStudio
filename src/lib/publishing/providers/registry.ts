import { youtubeProviderDefinition } from "@/lib/publishing/providers/youtube/registry";
import { ProviderDefinition, ProviderKey } from "@/types";

export const PROVIDER_REGISTRY: Record<ProviderKey, ProviderDefinition> = {
  youtube: youtubeProviderDefinition,
};

export const getProviderDefinition = (id: string) =>
  PROVIDER_REGISTRY[id as ProviderKey] ?? null;
