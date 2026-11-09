// public/sw.js
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Map of active scheduled timer IDs
const scheduledAlerts = new Map();

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || !data.type) return;

  if (data.type === "SCHEDULE_ALERT") {
    const { id, title, body, delayMs } = data;
    if (scheduledAlerts.has(id)) {
      clearTimeout(scheduledAlerts.get(id));
    }

    if (delayMs > 0) {
      const timeoutId = setTimeout(() => {
        self.registration.showNotification(title || "[CTU ALERT] OPERATION EXPIRED", {
          body: body || "Mission deadline reached. Open terminal immediately.",
          icon: "/favicon.ico",
          badge: "/favicon.ico",
          tag: id || "ctu-alert",
          vibrate: [300, 100, 300, 100, 600],
          requireInteraction: true,
          data: { url: "/" },
        });
        scheduledAlerts.delete(id);
      }, delayMs);

      scheduledAlerts.set(id, timeoutId);
    }
  } else if (data.type === "CANCEL_ALERT") {
    const { id } = data;
    if (scheduledAlerts.has(id)) {
      clearTimeout(scheduledAlerts.get(id));
      scheduledAlerts.delete(id);
    }
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow("/");
      }
    })
  );
});
