import type { ProviderAdapter } from "@/lib/publishing/adapter";
import { youtubeAdapter } from "@/lib/publishing/youtube-adapter";

const adapters: Record<string, ProviderAdapter> = {
  youtube: youtubeAdapter,
};

export const getProviderAdapter = (provider: string) =>
  adapters[provider] ?? null;

export type { ProviderAdapter } from "@/lib/publishing/adapter";
