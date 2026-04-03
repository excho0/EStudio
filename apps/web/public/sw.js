const CACHE_NAME = "estudio-v2";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icons/pwa-192.png", "/icons/pwa-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          return response;
        })
        .catch(async () => {
          return (await caches.match(request)) || (await caches.match("/"));
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => cachedResponse);

      return cachedResponse || networkFetch;
    }),
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const hasVisibleAppClient = clients.some((client) => {
        const visibilityState = client.visibilityState || "hidden";
        return visibilityState === "visible";
      });
      if (hasVisibleAppClient) {
        return;
      }

      let payload = null;
      try {
        payload = event.data.json();
      } catch {
        payload = { title: "EStudio", body: event.data.text() };
      }

      const title = payload?.title || "EStudio";
      const body = payload?.body;
      const icon = payload?.icon || "/icons/pwa-192.png";
      const badge = payload?.badge || "/icons/pwa-192.png";
      const image = payload?.image;
      const tag = payload?.tag;
      const data = {
        ...(payload?.data && typeof payload.data === "object" ? payload.data : {}),
        url: payload?.url || "/dashboard",
      };

      await self.registration.showNotification(title, {
        body,
        icon,
        ...(badge ? { badge } : {}),
        ...(image ? { image } : {}),
        tag,
        data,
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data && event.notification.data.url) || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          const currentUrl = new URL(client.url);
          const wantedUrl = new URL(targetUrl, self.location.origin);
          if (currentUrl.pathname === wantedUrl.pathname) {
            return client.focus();
          }
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    }),
  );
});
