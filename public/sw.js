// public/sw.js — CTU Background Operations & Samsung Notification HUD
// Scope: /

const DB_NAME = "ctu-alarms-db";
const STORE_NAME = "deadlines";
const HUD_TAG = "ctu-lockscreen-hud";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbPut(item) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error("[SW] dbPut error:", err);
  }
}

async function dbDelete(id) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error("[SW] dbDelete error:", err);
  }
}

async function dbGetAll() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("[SW] dbGetAll error:", err);
    return [];
  }
}

const liveTimers = new Map();

// Clear the persistent live countdown notification in the shade
async function clearLockscreenHUD() {
  try {
    const notifications = await self.registration.getNotifications({ tag: HUD_TAG });
    for (const n of notifications) {
      n.close();
    }
  } catch (err) {
    console.warn("[SW] clearLockscreenHUD error:", err);
  }
}

// Display ongoing live countdown in Android notification shade
async function showLockscreenHUD(payload) {
  const title = payload.title || "[CTU TACTICAL TIMER]";
  const body = payload.body || "Mission in progress...";

  const options = {
    body,
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: HUD_TAG,
    renotify: false,
    silent: true,
    requireInteraction: true,
    data: {
      id: payload.id || "live-hud",
      url: "/",
    },
    actions: [
      { action: "open", title: "OPEN TERMINAL" },
      { action: "disarm", title: "DISARM" },
    ],
  };

  return self.registration.showNotification(title, options);
}

// Full Crisis Alarm Notification when zero is reached
async function showTacticalNotification(deadline) {
  await dbDelete(deadline.id);
  await clearLockscreenHUD();

  if (liveTimers.has(deadline.id)) {
    clearTimeout(liveTimers.get(deadline.id));
    liveTimers.delete(deadline.id);
  }

  const title = deadline.title || "[CTU CRISIS ALERT] MISSION AT ZERO";
  const body =
    deadline.body ||
    `Operation "${deadline.label || "TACTICAL"}" reached zero. Immediate action required.`;

  const options = {
    body,
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: deadline.id,
    renotify: true,
    requireInteraction: true,
    vibrate: [300, 100, 300, 100, 600, 200, 600],
    data: {
      id: deadline.id,
      label: deadline.label,
      targetEpochMs: deadline.targetEpochMs,
      url: "/",
    },
    actions: [
      { action: "open", title: "OPEN TERMINAL" },
      { action: "snooze", title: "SNOOZE 5M" },
      { action: "disarm", title: "DISARM" },
    ],
  };

  return self.registration.showNotification(title, options);
}

async function armDeadline(deadline) {
  const remainingMs = deadline.targetEpochMs - Date.now();
  if (remainingMs <= 0) {
    await showTacticalNotification(deadline);
    return;
  }

  await dbPut(deadline);

  if (liveTimers.has(deadline.id)) {
    clearTimeout(liveTimers.get(deadline.id));
  }

  if ("showTrigger" in Notification.prototype && typeof self.TimestampTrigger !== "undefined") {
    try {
      const trigger = new self.TimestampTrigger(deadline.targetEpochMs);
      await self.registration.showNotification(
        deadline.title || "[CTU CRISIS ALERT] MISSION AT ZERO",
        {
          body: deadline.body || `Operation "${deadline.label}" reached zero.`,
          icon: "/favicon.ico",
          badge: "/favicon.ico",
          tag: deadline.id,
          showTrigger: trigger,
          requireInteraction: true,
          vibrate: [300, 100, 300, 100, 600, 200, 600],
          data: { id: deadline.id, url: "/" },
        }
      );
      return;
    } catch {
      // Fallback
    }
  }

  const timerId = setTimeout(async () => {
    liveTimers.delete(deadline.id);
    await showTacticalNotification(deadline);
  }, remainingMs);

  liveTimers.set(deadline.id, timerId);
}

async function cancelDeadline(id) {
  await dbDelete(id);
  if (liveTimers.has(id)) {
    clearTimeout(liveTimers.get(id));
    liveTimers.delete(id);
  }
  const notifs = await self.registration.getNotifications({ tag: id });
  for (const n of notifs) n.close();
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      const stored = await dbGetAll();
      const now = Date.now();
      for (const d of stored) {
        if (d.targetEpochMs <= now) {
          await showTacticalNotification(d);
        } else {
          await armDeadline(d);
        }
      }
    })()
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  switch (data.type) {
    case "SKIP_WAITING":
      self.skipWaiting();
      break;

    case "ARM_DEADLINE":
      if (data.deadline && data.deadline.id && data.deadline.targetEpochMs) {
        event.waitUntil(armDeadline(data.deadline));
      }
      break;

    case "CANCEL_DEADLINE":
      if (data.id) {
        event.waitUntil(cancelDeadline(data.id));
      }
      break;

    case "UPDATE_LOCKSCREEN_HUD":
      event.waitUntil(showLockscreenHUD(data));
      break;

    case "CLEAR_LOCKSCREEN_HUD":
      event.waitUntil(clearLockscreenHUD());
      break;

    default:
      break;
  }
});

self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const action = event.action;
  const data = notification.data || {};

  notification.close();

  if (action === "disarm") {
    if (data.id) {
      event.waitUntil(cancelDeadline(data.id));
    }
    return;
  }

  if (action === "snooze") {
    const snoozeTarget = Date.now() + 5 * 60 * 1000;
    event.waitUntil(
      armDeadline({
        id: data.id || `snooze-${Date.now()}`,
        label: `${data.label || "ALARM"} (SNOOZED)`,
        targetEpochMs: snoozeTarget,
        title: "[CTU SNOOZE EXPIRED]",
        body: "Snooze window of 5 minutes elapsed. Tactical attention required.",
      })
    );
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(data.url || "/");
      }
    })
  );
});
