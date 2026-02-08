import { ApiClient } from "@/lib/sdk/client";
import { z } from "zod";
import { settingsResponseSchema } from "@/lib/data/settings";

const client = new ApiClient();
export type SettingsResponse = z.infer<typeof settingsResponseSchema>;

export const settingsSdk = {
  get(): Promise<SettingsResponse> {
    return client.get(
      "/api/settings",
      "Failed to load settings",
      settingsResponseSchema
    );
  },
};
