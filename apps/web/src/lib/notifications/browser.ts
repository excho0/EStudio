import { getNotificationEnabled } from "./preferences";
import { APP_NAME } from "@/lib/shared/constants";

export const requestNotificationPermission = async () => {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported" as const;
  }
  if (Notification.permission === "granted") {
    return "granted" as const;
  }
  const permission = await Notification.requestPermission();
  return permission;
};

export const notifyOSAppEvent = (title: string, body?: string) => {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return;
  }

  if (!getNotificationEnabled() || Notification.permission !== "granted") {
    return;
  }

  if (document.visibilityState !== "hidden") {
    return;
  }

  const iconUrl = `${window.location.origin}/icons/pwa-192.png`;
  const badgeUrl = `${window.location.origin}/icons/pwa-192.png`;
  const normalizedTitle = title.trim();
  const brandedTitle = normalizedTitle.startsWith(APP_NAME)
    ? normalizedTitle
    : `${APP_NAME} · ${normalizedTitle}`;

  new Notification(brandedTitle, {
    body,
    icon: iconUrl,
    badge: badgeUrl,
  });
  
};
