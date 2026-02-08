import { ApiClient } from "@/lib/sdk/client";
import { z } from "zod";
import { metaProvidersResponseSchema } from "@/lib/data/meta";

const client = new ApiClient();
export type MetaProvidersResponse = z.infer<typeof metaProvidersResponseSchema>;

export const metaSdk = {
  providers(): Promise<MetaProvidersResponse> {
    return client.get(
      "/api/meta/providers",
      "Failed to load providers.",
      metaProvidersResponseSchema
    );
  },
};
