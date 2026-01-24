const NOTIFICATION_KEY = "notifications:render-complete";

export const getNotificationEnabled = () => {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(NOTIFICATION_KEY) === "true";
};

export const setNotificationEnabled = (value: boolean) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NOTIFICATION_KEY, value ? "true" : "false");
};

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
