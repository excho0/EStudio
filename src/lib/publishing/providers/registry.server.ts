import {
  type ProviderDefinitionServer,
} from "@/types";
import { getProviderDefinition } from "@/lib/publishing/providers/registry";

import {
  clearYoutubeCache,
  getYoutubeAvatar,
  getYoutubeConnection,
} from "@/lib/publishing/providers/youtube/connection";

export const getProviderDefinitionServer = (id: string): ProviderDefinitionServer | null => {
  const base = getProviderDefinition(id);
  if (!base) return null;

  if (id === "youtube") {
    return {
      ...base,
      getConnection: getYoutubeConnection,
      getAvatar: getYoutubeAvatar,
      clearCache: clearYoutubeCache,
    } satisfies ProviderDefinitionServer;
  }

  return base;
};
