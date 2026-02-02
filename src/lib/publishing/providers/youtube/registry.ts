import { Youtube } from "lucide-react";

import {
  YOUTUBE_CONNECTION_ENDPOINT,
  YOUTUBE_OAUTH_PROVIDER_ID,
  YOUTUBE_PROVIDER_KEY,
} from "@/lib/publishing/providers/youtube/constants";
import type { ProviderDefinition } from "@/lib/publishing/providers/registry";

export const youtubeProviderDefinition: ProviderDefinition = {
  id: YOUTUBE_PROVIDER_KEY,
  label: "YouTube",
  icon: Youtube,
  oauthProviderId: YOUTUBE_OAUTH_PROVIDER_ID,
  oauthProviderName: "google",
  oauthAuthorizationParams: {
    scope:
      "openid email profile https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  },
  badgeVariant: "red",
  connectionEndpoint: YOUTUBE_CONNECTION_ENDPOINT,
  getAssetUrl: (assetId) => (assetId ? `https://youtu.be/${assetId}` : null),
  capabilities: {
    supportsSchedule: true,
    supportsPrivacy: true,
    privacyOptions: ["public", "unlisted", "private"],
    supportsTags: true,
    supportsCategories: true,
  },
};
