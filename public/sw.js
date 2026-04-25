/* Coach Casey service worker.
 *
 * One job today: handle web push notifications and route notification clicks
 * back into the app. No offline shell, no background sync, no asset caching.
 * If we add those later, do it via Serwist or a hand-rolled cache strategy
 * — don't spread cache logic across the push handler.
 */

self.addEventListener("install", (event) => {
  // Take over immediately on first install so subscribe flows complete in the
  // same session as registration. Standard for push-only SWs.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (err) {
    // Push services occasionally deliver empty/non-JSON pings to keep
    // subscriptions alive. Fall through with defaults.
    console.warn("push payload parse failed", err);
  }

  const title = payload.title || "Coach Casey";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag,
    // renotify=true forces the device to re-alert when an existing tag is
    // replaced — important so an updated debrief doesn't slide in silently.
    renotify: Boolean(payload.tag),
    data: {
      url: payload.url || "/app",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/app";

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // If a tab is already open on this origin, focus it and navigate.
      for (const client of all) {
        try {
          const url = new URL(client.url);
          if (url.origin === self.location.origin) {
            await client.focus();
            if ("navigate" in client) {
              await client.navigate(target);
            }
            return;
          }
        } catch {
          // Ignore parse failures and fall through to openWindow.
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
