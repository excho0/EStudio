import { pushSubscriptionInputSchema } from "@/lib/push/schemas";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim();

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export const isWebPushSupported = () => {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined"
  );
};

export async function getCurrentPushSubscription() {
  if (!isWebPushSupported()) {
    return null;
  }
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function subscribeToWebPush() {
  if (!isWebPushSupported() || !VAPID_PUBLIC_KEY) {
    throw new Error("Web Push is not configured in this environment.");
  }

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const browserSubscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  const payload = pushSubscriptionInputSchema.parse({
    endpoint: browserSubscription.endpoint,
    expirationTime: browserSubscription.expirationTime ?? null,
    keys: browserSubscription.toJSON().keys,
    userAgent: navigator.userAgent,
  });

  const response = await fetch("/api/push/subscriptions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("Failed to save push subscription.");
  }
  return browserSubscription;
}

export async function unsubscribeFromWebPush() {
  const existing = await getCurrentPushSubscription();
  if (!existing) {
    return;
  }

  await fetch("/api/push/subscriptions", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: existing.endpoint }),
  });
  await existing.unsubscribe();
}
