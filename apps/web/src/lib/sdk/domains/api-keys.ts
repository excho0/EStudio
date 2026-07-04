import { ApiClient } from "@/lib/sdk/client";
import {
  apiKeyCreateResponseSchema,
  apiKeyListResponseSchema,
  apiKeyUpdateResponseSchema,
} from "@/lib/data/api-keys/schemas";

const client = new ApiClient();

export const apiKeysSdk = {
  list() {
    return client.get(
      "/api/user/api-keys",
      "Failed to load API keys.",
      apiKeyListResponseSchema
    );
  },
  create(payload: unknown) {
    return client.postJson(
      "/api/user/api-keys",
      payload,
      "Failed to create API key.",
      apiKeyCreateResponseSchema
    );
  },
  update(id: string, payload: unknown) {
    return client.patchJson(
      `/api/user/api-keys/${id}`,
      payload,
      "Failed to update API key.",
      apiKeyUpdateResponseSchema
    );
  },
  delete(id: string) {
    return client.delJson(
      `/api/user/api-keys/${id}`,
      undefined,
      "Failed to delete API key."
    );
  },
};
