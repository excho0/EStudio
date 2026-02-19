import { getNotificationEnabled } from "./preferences";

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

export const notifyRenderComplete = (title: string, body?: string) => {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return;
  }
  if (!getNotificationEnabled() || Notification.permission !== "granted") {
    return;
  }
  if (document.visibilityState !== "hidden") {
    return;
  }
  new Notification(title, body ? { body } : undefined);
};
