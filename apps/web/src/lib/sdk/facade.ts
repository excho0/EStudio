import { contentSdk } from "@/lib/sdk/domains/content";
import { dashboardSdk } from "@/lib/sdk/domains/dashboard";
import { metaSdk } from "@/lib/sdk/domains/meta";
import { notificationsSdk } from "@/lib/sdk/domains/notifications";
import { publishSdk } from "@/lib/sdk/domains/publish";
import { settingsSdk } from "@/lib/sdk/domains/settings";
import { uploadsSdk } from "@/lib/sdk/domains/uploads";
import { userSdk } from "@/lib/sdk/domains/user";
import { userPreferencesSdk } from "@/lib/sdk/domains/user-preferences";

export const sdk = {
  content: contentSdk,
  dashboard: dashboardSdk,
  uploads: uploadsSdk,
  user: userSdk,
  userPreferences: userPreferencesSdk,
  publish: publishSdk,
  notifications: notificationsSdk,
  settings: settingsSdk,
  meta: metaSdk,
} as const;

export type Sdk = typeof sdk;
