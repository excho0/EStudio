import { z } from "zod";
import { ApiClient } from "@/lib/sdk/client";
import {
  userNotificationPreferencesResponseSchema,
  userNotificationPreferencesUpdateRequestSchema,
  userNotificationPreferencesUpdateResponseSchema,
} from "@/lib/data/user-preferences/schemas";

const client = new ApiClient();

export type UserNotificationPreferencesResponse = z.infer<
  typeof userNotificationPreferencesResponseSchema
>;
export type UserNotificationPreferencesUpdateRequest = z.infer<
  typeof userNotificationPreferencesUpdateRequestSchema
>;
export type UserNotificationPreferencesUpdateResponse = z.infer<
  typeof userNotificationPreferencesUpdateResponseSchema
>;

export const userPreferencesSdk = {
  notifications(): Promise<UserNotificationPreferencesResponse> {
    return client.get(
      "/api/user/preferences/notifications",
      "Failed to load notification preferences.",
      userNotificationPreferencesResponseSchema
    );
  },
  updateNotifications(
    payload: UserNotificationPreferencesUpdateRequest
  ): Promise<UserNotificationPreferencesUpdateResponse> {
    const parsed = userNotificationPreferencesUpdateRequestSchema.parse(payload);
    return client.patchJson(
      "/api/user/preferences/notifications",
      parsed,
      "Failed to update notification preferences.",
      userNotificationPreferencesUpdateResponseSchema
    );
  },
};
