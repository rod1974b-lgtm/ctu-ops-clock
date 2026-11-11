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
    const { id, title, body, delayMs, targetEpochMs } = data;
    if (activeAlerts.has(id)) {
      clearTimeout(activeAlerts.get(id));
      activeAlerts.delete(id);
    }

    if (delayMs > 0) {
      const timerId = setTimeout(() => {
        self.registration.showNotification(title || "[CTU CRISIS ALERT] OPERATION EXPIRED", {
          body: body || "Mission deadline reached. Tactical override active.",
          icon: "/favicon.ico",
          badge: "/favicon.ico",
          tag: id || "ctu-alert",
          vibrate: [300, 100, 300, 100, 600, 100, 800],
          requireInteraction: true,
          renotify: true,
          silent: false,
          actions: [
            { action: "open", title: "OPEN TERMINAL" },
            { action: "snooze", title: "SNOOZE 5M" },
            { action: "disarm", title: "DISARM" },
          ],
          data: { url: "/?crisis=true", id: id || "timer", targetEpochMs },
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
  } else if (data.type === "UPDATE_LOCKSCREEN_HUD" || data.type === "UPDATE_LIVE_STATUS") {
    const { title, body } = data;
    self.registration.showNotification(title || "[CTU ACTIVE HUD] OPERATIONAL WATCH", {
      body: body || "Monitoring active mission deadlines.",
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: "ctu-lockscreen-hud",
      renotify: false,
      silent: true,
      requireInteraction: false,
      actions: [
        { action: "open", title: "EXPAND HUD" },
        { action: "disarm_all", title: "DISARM ALL" },
      ],
      data: { url: "/", type: "hud" },
    });
  } else if (data.type === "CLEAR_LOCKSCREEN_HUD" || data.type === "CLEAR_LIVE_STATUS") {
    self.registration.getNotifications({ tag: "ctu-lockscreen-hud" }).then((notifications) => {
      for (const n of notifications) {
        n.close();
      }
    });
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const action = event.action;
  const data = event.notification.data || {};

  if (action === "snooze") {
    // Re-arm a 5-minute (300,000ms) background emergency timer
    const snoozeId = (data.id || "snooze") + "-snooze";
    const snoozeMs = 5 * 60 * 1000;
    const timerId = setTimeout(() => {
      self.registration.showNotification("[CTU CRISIS ALERT] SNOOZE EXPIRED", {
        body: "5-minute stand-down expired. Return to operational status.",
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        tag: snoozeId,
        vibrate: [300, 100, 300, 100, 600],
        requireInteraction: true,
        actions: [
          { action: "open", title: "OPEN TERMINAL" },
          { action: "disarm", title: "DISARM" },
        ],
        data: { url: "/?crisis=true", id: snoozeId },
      });
      activeAlerts.delete(snoozeId);
    }, snoozeMs);

    activeAlerts.set(snoozeId, timerId);

    // Inform open clients
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const c of clients) {
        c.postMessage({ type: "SNOOZE_APPLIED", minutes: 5 });
      }
    });
    return;
  }

  if (action === "disarm" || action === "disarm_all") {
    if (data.id && activeAlerts.has(data.id)) {
      clearTimeout(activeAlerts.get(data.id));
      activeAlerts.delete(data.id);
    }
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const c of clients) {
        c.postMessage({ type: "DISARM_MISSION", id: data.id });
      }
    });
    return;
  }

  // Default action: Focus running window or launch terminal directly into Crisis mode
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.postMessage({ type: "CRISIS_WAKE", id: data.id });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(data.url || "/");
      }
    })
  );
});

self.addEventListener("notificationclose", (event) => {
  // Notification dismissed by user
});
