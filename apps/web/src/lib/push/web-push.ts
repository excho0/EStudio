import webpush from "web-push";
import type { NotificationKind } from "@/types";
import { isUserPushCategoryEnabled } from "@/lib/data/user-preferences";
import { listActivePushSubscriptions, disablePushSubscriptionByEndpoint } from "./repository";
import type { WebPushPayload } from "./schemas";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
const PRIVATE_KEY = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
const SUBJECT = process.env.WEB_PUSH_VAPID_SUBJECT?.trim();

let configured = false;

function ensureWebPushConfigured() {
  if (configured) {
    return PUBLIC_KEY && PRIVATE_KEY && SUBJECT;
  }
  configured = true;
  if (PUBLIC_KEY && PRIVATE_KEY && SUBJECT) {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
    return true;
  }
  return false;
}

export function isWebPushConfigured() {
  return ensureWebPushConfigured();
}

export async function sendWebPushToUser(userId: string, payload: WebPushPayload) {
  if (!ensureWebPushConfigured()) {
    return { sent: 0, skipped: true as const };
  }

  const subscriptions = await listActivePushSubscriptions(userId);
  let sent = 0;

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          expirationTime: subscription.expirationTime ?? null,
          keys: subscription.keys,
        },
        JSON.stringify(payload),
      );
      sent += 1;
    } catch (error) {
      const statusCode =
        typeof error === "object" && error !== null && "statusCode" in error
          ? Number((error as { statusCode?: unknown }).statusCode)
          : null;
      if (statusCode === 404 || statusCode === 410) {
        await disablePushSubscriptionByEndpoint(subscription.endpoint);
      }
    }
  }

  return { sent, skipped: false as const };
}

export async function sendWebPushToUserByKind(
  userId: string,
  kind: NotificationKind,
  payload: WebPushPayload
) {
  const enabled = await isUserPushCategoryEnabled(userId, kind);
  if (!enabled) {
    return { sent: 0, skipped: true as const };
  }
  return sendWebPushToUser(userId, payload);
}
