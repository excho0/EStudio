import { ApiClient } from "@/lib/sdk/client";
import { z } from "zod";
import {
  publishProviderResponseSchema,
  publishProvidersResponseSchema,
} from "@/lib/data/publish";

const client = new ApiClient();

export type PublishProvidersResponse = z.infer<typeof publishProvidersResponseSchema>;
export type PublishProviderResponse = z.infer<typeof publishProviderResponseSchema>;

export const publishSdk = {
  providers(): Promise<PublishProvidersResponse> {
    return client.get(
      "/api/publish/providers",
      "Unable to load publish targets.",
      publishProvidersResponseSchema
    );
  },
  provider(id: string): Promise<PublishProviderResponse> {
    return client.get(
      `/api/publish/providers/${id}`,
      "Failed to load provider",
      publishProviderResponseSchema
    );
  },
  unlinkProvider(id: string): Promise<void> {
    return client.del(`/api/publish/providers/${id}`, "Failed to disconnect provider");
  },
  providerAvatarUrl(id: string) {
    return `/api/publish/providers/${id}/avatar`;
  },
};
