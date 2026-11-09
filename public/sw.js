// public/sw.js
// Counter Terrorist Unit Tactical Service Worker: Background Scheduling, Live Lockscreen HUD, & Crisis Wake

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

const activeAlerts = new Map();

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || !data.type) return;

  if (data.type === "SCHEDULE_ALERT") {
    const { id, title, body, delayMs } = data;
    if (activeAlerts.has(id)) {
      clearTimeout(activeAlerts.get(id));
    }

    if (delayMs > 0) {
      const timerId = setTimeout(() => {
        self.registration.showNotification(title || "[CTU CRISIS ALERT] OPERATION EXPIRED", {
          body: body || "Mission deadline reached. Tactical override engaged.",
          icon: "/favicon.ico",
          badge: "/favicon.ico",
          tag: id || "ctu-alert",
          vibrate: [300, 100, 300, 100, 600],
          requireInteraction: true,
          data: { url: "/" },
        });
        activeAlerts.delete(id);
      }, delayMs);

      activeAlerts.set(id, timerId);
    }
  } else if (data.type === "CANCEL_ALERT") {
    const { id } = data;
    if (activeAlerts.has(id)) {
      clearTimeout(activeAlerts.get(id));
      activeAlerts.delete(id);
    }
  } else if (data.type === "UPDATE_LIVE_STATUS") {
    const { title, body } = data;
    self.registration.showNotification(title || "[CTU LIVE] TACTICAL MONITOR", {
      body: body || "Monitoring active mission deadlines.",
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: "ctu-live-status",
      renotify: false,
      silent: true,
      requireInteraction: false,
      data: { url: "/" },
    });
  } else if (data.type === "CLEAR_LIVE_STATUS") {
    self.registration.getNotifications({ tag: "ctu-live-status" }).then((notifications) => {
      for (const n of notifications) {
        n.close();
      }
    });
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
