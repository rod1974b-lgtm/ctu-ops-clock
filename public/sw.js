// public/sw.js — CTU Background Operations & Web Push Service Worker
// Scope: / (served from root)
// Provides:
//  1) Live Ongoing Status-Bar Notification (Samsung-style live countdown HUD).
//  2) Local deadline persistence in IndexedDB with TimestampTrigger hardware alarm integration.
//  3) Background Web Push listener ('push') to wake dark/locked phone screens.
//  4) Catch-up and firing of overdue alarms whenever the worker activates.
//  5) Interactive notification actions (OPEN TERMINAL, SNOOZE 5M, DISARM).

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

// Clear the persistent live countdown notification
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

// Display ongoing countdown in the Android / Samsung notification drawer
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
      { action: "open", title: "OPEN HUD" },
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
  const body = deadline.body || `Operation "${deadline.label || "TACTICAL"}" reached zero. Immediate action required.`;

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

  // Attempt Chromium Notification Triggers API (delegates to Android AlarmManager)
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
      // Fallback to in-memory timer
    }
  }

  const safeDelay = Math.min(remainingMs, 2147483647);
  const timeoutId = setTimeout(() => {
    showTacticalNotification(deadline).catch((err) =>
      console.error("[SW] Notification display error:", err)
    );
  }, safeDelay);

  liveTimers.set(deadline.id, timeoutId);
}

async function checkMissedDeadlines() {
  const all = await dbGetAll();
  const now = Date.now();
  for (const deadline of all) {
    if (deadline.targetEpochMs <= now) {
      await showTacticalNotification(deadline);
    } else {
      await armDeadline(deadline);
    }
  }
}

// Lifecycle Events
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      await checkMissedDeadlines();
    })()
  );
});

// Incoming messages from the CTU Terminal client
self.addEventListener("message", (event) => {
  const msg = event.data || {};

  if (msg.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (msg.type === "UPDATE_LOCKSCREEN_HUD") {
    event.waitUntil(showLockscreenHUD(msg));
    return;
  }

  if (msg.type === "CLEAR_LOCKSCREEN_HUD") {
    event.waitUntil(clearLockscreenHUD());
    return;
  }

  if (msg.type === "SCHEDULE_ALERT") {
    const targetEpochMs = msg.targetEpochMs ?? msg.epochMs;
    if (!targetEpochMs || !msg.id) return;

    event.waitUntil(
      armDeadline({
        id: msg.id,
        label: msg.label || "Tactical Alert",
        title: msg.title || "[CTU CRISIS ALERT]",
        body: msg.body || "Mission reached zero.",
        targetEpochMs,
      })
    );
    return;
  }

  if (msg.type === "CANCEL_ALERT") {
    if (liveTimers.has(msg.id)) {
      clearTimeout(liveTimers.get(msg.id));
      liveTimers.delete(msg.id);
    }
    event.waitUntil(dbDelete(msg.id));
    return;
  }

  if (msg.type === "CHECK_MISSED") {
    event.waitUntil(checkMissedDeadlines());
    return;
  }
});

// Web Push event listener — wakes mobile device from deep sleep
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: "[CTU CRISIS ALERT]",
      body: event.data ? event.data.text() : "Tactical alarm dispatched from server.",
    };
  }

  const deadline = {
    id: payload.id || `push-${Date.now()}`,
    label: payload.label || "TACTICAL ALERT",
    title: payload.title || "[CTU CRISIS ALERT] MISSION AT ZERO",
    body: payload.body || "Operational deadline reached. Immediate action required.",
    targetEpochMs: Date.now(),
  };

  event.waitUntil(showTacticalNotification(deadline));
});

// Notification interaction handler
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const action = event.action;
  const data = event.notification.data || {};

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      const existingClient = windowClients.find(
        (client) => new URL(client.url).pathname === "/"
      );

      if (action === "snooze") {
        if (existingClient) {
          existingClient.postMessage({
            type: "SNOOZE_APPLIED",
            id: data.id,
            minutes: 5,
          });
          await existingClient.focus();
        } else {
          await armDeadline({
            id: data.id || `snooze-${Date.now()}`,
            label: data.label ? `${data.label} (SNOOZED)` : "SNOOZED MISSION",
            title: "[CTU SNOOZE EXPIRED]",
            body: "5-minute tactical snooze has elapsed.",
            targetEpochMs: Date.now() + 5 * 60 * 1000,
          });
        }
        return;
      }

      if (action === "disarm") {
        await clearLockscreenHUD();
        if (data.id) {
          await dbDelete(data.id);
        }
        if (existingClient) {
          existingClient.postMessage({
            type: "DISARM_MISSION",
            id: data.id,
          });
        }
        return;
      }

      // Default click or "open" action
      if (existingClient) {
        await existingClient.focus();
        existingClient.postMessage({ type: "CHECK_MISSED" });
      } else {
        await self.clients.openWindow("/");
      }
    })()
  );
});
