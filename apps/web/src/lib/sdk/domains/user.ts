import { ApiClient } from "@/lib/sdk/client";
import { z } from "zod";
import {
  connectionsResponseSchema,
  okResponseSchema,
  profilePayloadSchema,
} from "@/lib/data/user";

const client = new ApiClient();

export type UserProfileResponse = z.infer<typeof profilePayloadSchema>;
export type UserConnectionsResponse = z.infer<typeof connectionsResponseSchema>;
export type UserOkResponse = z.infer<typeof okResponseSchema>;

export const userSdk = {
  profile(): Promise<UserProfileResponse> {
    return client.get(
      "/api/user/profile",
      "Failed to load profile",
      profilePayloadSchema
    );
  },
  updateProfile(payload: { name: string }): Promise<UserProfileResponse> {
    return client.putJson(
      "/api/user/profile",
      payload,
      "Failed to update profile",
      profilePayloadSchema
    );
  },
  requestEmailChange(payload: { email: string }): Promise<UserProfileResponse> {
    return client.postJson(
      "/api/user/profile/email",
      payload,
      "Failed to send verification email",
      profilePayloadSchema
    );
  },
  connections(): Promise<UserConnectionsResponse> {
    return client.get(
      "/api/user/profile/connections",
      "Unable to load connections.",
      connectionsResponseSchema
    );
  },
  unlinkProvider(provider: string): Promise<UserOkResponse> {
    return client.delJson(
      "/api/user/profile/connections",
      { provider },
      "Failed to unlink provider",
      okResponseSchema
    );
  },
  avatarUrl(provider: string, cacheBust?: string) {
    const v = cacheBust ?? Date.now().toString();
    return `/api/user/profile/avatar?provider=${provider}&v=${v}`;
  },
};
