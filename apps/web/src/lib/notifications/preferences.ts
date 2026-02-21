const NOTIFICATION_KEY = "notifications:render-complete";

export const getNotificationEnabled = () => {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(NOTIFICATION_KEY) === "true";
};

export const setNotificationEnabled = (value: boolean) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NOTIFICATION_KEY, value ? "true" : "false");
};
