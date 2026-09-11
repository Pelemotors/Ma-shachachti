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
  const url = safeUrl(data.url);
  event.waitUntil(
    self.registration.showNotification(data.title || "מה שכחתי?", {
      body: data.body || "יש משימה שצריך לשים לב אליה",
      tag: data.tag || "task-reminder",
      icon: data.icon || "/icon.svg",
      badge: data.badge || "/icon.svg",
      data: {
        url,
        taskId: data.data?.taskId ?? data.taskId ?? null,
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
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
