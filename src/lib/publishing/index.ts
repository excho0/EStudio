import { youtubeAdapter } from "@/lib/publishing/youtube-adapter";
import { ProviderAdapter } from "@/types";

const adapters: Record<string, ProviderAdapter> = {
  youtube: youtubeAdapter,
};

export const getProviderAdapter = (provider: string) =>
  adapters[provider] ?? null;