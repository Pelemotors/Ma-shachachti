// Deliberately no runtime caching: never cache API, chat, tasks, memory, or authenticated data.
const DEFAULT_URL = "/app";

function safeUrl(value) {
  try {
    const url = new URL(
      typeof value === "string" ? value : DEFAULT_URL,
      self.location.origin,
    );
    if (url.origin !== self.location.origin) return DEFAULT_URL;
    if (url.pathname !== "/app" && !url.pathname.startsWith("/app/")) {
      return DEFAULT_URL;
    }
    return url.pathname + url.search + url.hash;
  } catch {
    return DEFAULT_URL;
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    /* ignore */
  }
  const url = safeUrl(data.url ?? data.data?.url);
  const title = data.title || "מה שכחתי?";
  const body = data.body || "יש משימה שצריך לשים לב אליה";
  const tag = data.tag || "task-reminder";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      // Heads-up / lock-screen style — stay visible until the user acts.
      requireInteraction: true,
      renotify: true,
      silent: false,
      vibrate: [220, 100, 220, 100, 320],
      dir: "rtl",
      lang: "he",
      // PNG icons — Android often ignores SVG for system notifications.
      icon: data.icon || "/icon-192.png",
      badge: data.badge || "/badge-72.png",
      timestamp: Date.now(),
      actions: [
        { action: "open", title: "פתח" },
        { action: "dismiss", title: "סגור" },
      ],
      data: {
        url,
        taskId: data.data?.taskId ?? data.taskId ?? null,
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  const action = event.action;
  event.notification.close();
  if (action === "dismiss") return;

  const target = safeUrl(event.notification.data?.url);
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (windows) => {
        for (const client of windows) {
          if (new URL(client.url).origin === self.location.origin) {
            await client.navigate(target);
            return client.focus();
          }
        }
        return clients.openWindow(target);
      }),
  );
});

// Keep SW active so push can wake the device even when the tab is gone.
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
