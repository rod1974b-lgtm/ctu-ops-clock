// public/sw.js — CTU background alerts
// IMPORTANT: place this file at public/sw.js so it is served at /sw.js (same origin, root scope).
// A service worker CANNOT be trusted to run a long setTimeout after the tab/app is closed:
// iOS Safari and Android Chrome kill / throttle it. So this worker does 3 things:
//  1) shows the notification if it is still alive at fire time,
//  2) persists every deadline in IndexedDB, and re-arms them on install/activate/message,
//  3) on every wake-up (fetch/message/activate) checks for missed deadlines and fires them immediately.
// The page side (src/lib/background-alarms.ts) is the other half: it re-schedules
// everything on every load/visibilitychange, and fires missed deadlines the moment you reopen.

const DB_NAME = "ctu-alarms-db";
const STORE = "deadlines";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function dbPut(deadline) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(deadline);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function dbDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function dbAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// In-memory timers for THIS worker lifetime only. They die with the worker —
// that is expected. Persistence + re-arming on wake is what makes this work.
const liveTimers = new Map();

async function showAlert(d) {
  await dbDelete(d.id);
  liveTimers.delete(d.id);
  // waitUntil keeps the worker alive until the notification is shown.
  await self.registration.showNotification(d.title || "CTU ALERT", {
    body: d.body || "Operation reached zero.",
    tag: d.id, // replaces duplicates instead of stacking 20 copies
    renotify: true,
    requireInteraction: true, // stays on lockscreen until dismissed (desktop/Android)
    vibrate: [200, 100, 200, 100, 400],
    data: { id: d.id, label: d.label, url: "/" },
  });
}

async function arm(d) {
  const delay = d.targetEpochMs - Date.now();
  if (delay <= 0) { await showAlert(d); return; }
  await dbPut(d);
  if (liveTimers.has(d.id)) clearTimeout(liveTimers.get(d.id));
  // Cap: browsers clamp very long timeouts to ~24.8 days and kill SWs long before that.
  // For alarms days away, the page re-arms on every open; the worker re-arms on wake.
  const t = setTimeout(() => { showAlert(d).catch(() => {}); }, Math.min(delay, 2147483647));
  liveTimers.set(d.id, t);
}

async function checkMissed() {
  const all = await dbAll();
  const now = Date.now();
  for (const d of all) {
    if (d.targetEpochMs <= now) await showAlert(d);
    else await arm(d); // re-arm anything still in the future
  }
}

self.addEventListener("install", (e) => { e.waitUntil(self.skipWaiting()); });
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => { await self.clients.claim(); await checkMissed(); })());
});

self.addEventListener("message", (e) => {
  const msg = e.data || {};
  if (msg.type === "SCHEDULE_ALERT") {
    // Accept every naming variant the old page sent: targetEpochMs / epochMs
    const targetEpochMs = msg.targetEpochMs ?? msg.epochMs;
    if (!targetEpochMs || !msg.id) return;
    e.waitUntil(arm({ id: msg.id, label: msg.label, title: msg.title, body: msg.body, targetEpochMs }));
  }
  if (msg.type === "CANCEL_ALERT") {
    if (liveTimers.has(msg.id)) clearTimeout(liveTimers.get(msg.id));
    liveTimers.delete(msg.id);
    e.waitUntil(dbDelete(msg.id));
  }
  if (msg.type === "CHECK_MISSED") e.waitUntil(checkMissed());
  if (msg.type === "CLEAR_LOCKSCREEN_HUD") { /* HUD was a fake concept — no persistent notification exists. Ignored on purpose. */ }
  if (msg.type === "UPDATE_LOCKSCREEN_HUD") { /* Same: a page cannot keep a lockscreen HUD alive after close. Ignored. */ }
});

// Clicking the notification must reopen/focus the app.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = all.find((c) => new URL(c.url).pathname === "/");
    if (existing) { await existing.focus(); await existing.postMessage({ type: "CHECK_MISSED" }); }
    else await self.clients.openWindow("/");
  })());
});
