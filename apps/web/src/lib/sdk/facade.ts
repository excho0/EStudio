import { contentSdk } from "@/lib/sdk/domains/content";
import { dashboardSdk } from "@/lib/sdk/domains/dashboard";
import { metaSdk } from "@/lib/sdk/domains/meta";
import { notificationsSdk } from "@/lib/sdk/domains/notifications";
import { publishSdk } from "@/lib/sdk/domains/publish";
import { settingsSdk } from "@/lib/sdk/domains/settings";
import { uploadsSdk } from "@/lib/sdk/domains/uploads";
import { userSdk } from "@/lib/sdk/domains/user";

export class Sdk {
  readonly content = contentSdk;
  readonly dashboard = dashboardSdk;
  readonly uploads = uploadsSdk;
  readonly user = userSdk;
  readonly publish = publishSdk;
  readonly notifications = notificationsSdk;
  readonly settings = settingsSdk;
  readonly meta = metaSdk;
}

export const sdk = new Sdk();
