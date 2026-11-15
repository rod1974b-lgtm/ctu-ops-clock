// public/sw.js — CTU Background Operations & Web Push Service Worker
// Scope: / (served from root)
// Provides:
//  1) Native Web Push listener ('push') to wake the phone when the app/browser is fully closed.
//  2) Local deadline persistence in IndexedDB with auto-triggering if the worker is alive.
//  3) Re-check and immediate firing of missed deadlines whenever the worker wakes (fetch, activate, push, message).
//  4) Interactive notification actions (OPEN TERMINAL, SNOOZE 5M, DISARM) that focus or launch the terminal.

const DB_NAME = "ctu-alarms-db";
const STORE_NAME = "deadlines";

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

// In-memory timer references for the current active worker lifecycle
const liveTimers = new Map();

async function showTacticalNotification(deadline) {
  await dbDelete(deadline.id);
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

  // Cap timeout to 32-bit int (~24.8 days)
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
  }

  if (msg.type === "CANCEL_ALERT") {
    if (liveTimers.has(msg.id)) {
      clearTimeout(liveTimers.get(msg.id));
      liveTimers.delete(msg.id);
    }
    event.waitUntil(dbDelete(msg.id));
  }

  if (msg.type === "CHECK_MISSED") {
    event.waitUntil(checkMissedDeadlines());
  }
});

// Web Push event listener — wakes mobile device from sleep via OS push service
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: "[CTU CRISIS ALERT]",
      body: event.data ? event.data.text() : "Tactical alarm fired from remote dispatch.",
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

// Notification click and interaction handler
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
          // Re-arm for 5 minutes in background
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
