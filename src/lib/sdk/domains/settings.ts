import { ApiClient } from "@/lib/sdk/client";
import {
  settingsResponseSchema,
  settingsUpdateRequestSchema,
  settingsUpdateResponseSchema,
} from "@/lib/data/settings/schemas";
import type {
  SettingsResponse,
  SettingsUpdateRequest,
  SettingsUpdateResponse,
} from "@/types";

const client = new ApiClient();

export const settingsSdk = {
  get(): Promise<SettingsResponse> {
    return client.get(
      "/api/settings",
      "Failed to load settings",
      settingsResponseSchema
    );
  },
  update(payload: SettingsUpdateRequest): Promise<SettingsUpdateResponse> {
    const parsed = settingsUpdateRequestSchema.parse(payload);
    return client.patchJson(
      "/api/settings",
      parsed,
      "Failed to update settings.",
      settingsUpdateResponseSchema
    );
  },
};
