// src/lib/background-alerts.ts — FULL DROP-IN REPLACEMENT FILE
export interface StoredDeadline {
  id: string;
  label: string;
  targetEpochMs: number;
  type: "timer" | "alarm";
  days?: number[] | undefined;
}

const DEADLINES_KEY = "ctu_active_deadlines";
const SW_URL = "/sw.js";

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function loadDeadlines(): StoredDeadline[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DEADLINES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveDeadlines(list: StoredDeadline[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DEADLINES_KEY, JSON.stringify(list));
  } catch (err) {
    console.error("[CTU] Failed to save deadlines to storage:", err);
  }
}

export function upsertDeadline(deadline: StoredDeadline): void {
  const current = loadDeadlines().filter((item) => item.id !== deadline.id);
  saveDeadlines([...current, deadline]);
}

export function removeDeadline(id: string): void {
  const filtered = loadDeadlines().filter((item) => item.id !== id);
  saveDeadlines(filtered);
}

export function registerCTUWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.resolve(null);
  }

  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register(SW_URL, { scope: "/" })
      .then((registration) => {
        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }
        return registration;
      })
      .catch((err) => {
        console.error("[CTU] Service worker registration failed:", err);
        return null;
      });
  }

  return registrationPromise;
}

export async function postToWorker(msg: unknown): Promise<void> {
  try {
    const registration = await registerCTUWorker();
    if (!registration) return;

    const worker =
      registration.active ||
      (await navigator.serviceWorker.ready).active;

    if (worker) {
      worker.postMessage(msg);
    }
  } catch (err) {
    console.error("[CTU] Failed to message service worker:", err);
  }
}

// Live Status Bar / Notification Shade HUD updates
export async function updateLockscreenHUD(
  title: string,
  body: string,
  id: string,
  targetEpochMs: number
): Promise<void> {
  await postToWorker({
    type: "UPDATE_LOCKSCREEN_HUD",
    title,
    body,
    id,
    targetEpochMs,
  });
}

export async function clearLockscreenHUD(): Promise<void> {
  await postToWorker({
    type: "CLEAR_LOCKSCREEN_HUD",
  });
}

export async function scheduleBackgroundAlert(deadline: {
  id: string;
  label: string;
  targetEpochMs: number;
  type: "timer" | "alarm";
  days?: number[] | undefined;
  title?: string;
  body?: string;
}): Promise<void> {
  upsertDeadline({
    id: deadline.id,
    label: deadline.label,
    targetEpochMs: deadline.targetEpochMs,
    type: deadline.type,
    days: deadline.days,
  });

  await postToWorker({
    type: "ARM_DEADLINE",
    deadline,
  });

  try {
    await fetch("/api/public/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "schedule",
        alarmId: deadline.id,
        label: deadline.label,
        targetEpochMs: deadline.targetEpochMs,
      }),
    });
  } catch {}
}

export async function cancelBackgroundAlert(id: string): Promise<void> {
  removeDeadline(id);
  await postToWorker({
    type: "CANCEL_DEADLINE",
    id,
  });

  try {
    await fetch("/api/public/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "cancel",
        alarmId: id,
      }),
    });
  } catch {}
}

// Subscribe to Web Push via PushManager and sync with backend
export async function enableWebPushSubscription(): Promise<PushSubscription | null> {
  if (typeof window === "undefined" || !("PushManager" in window)) {
    return null;
  }

  try {
    const registration = await registerCTUWorker();
    if (!registration) return null;

    let vapidKey: string | null = null;
    try {
      const res = await fetch("/api/public/push");
      if (res.ok) {
        const json = await res.json();
        vapidKey = json.vapidPublicKey || null;
      }
    } catch {}

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription && vapidKey) {
      const urlBase64ToUint8Array = (base64String: string) => {
        const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
          outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
      };

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }

    if (subscription) {
      await fetch("/api/public/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "subscribe",
          subscription: subscription.toJSON(),
        }),
      });
    }

    return subscription;
  } catch (err) {
    console.warn("[CTU] Web Push subscription failed:", err);
    return null;
  }
}

// Wire alarm or timer directly into native Samsung / Android phone clock
export function syncWithNativePhoneClock(
  type: "timer" | "alarm",
  options: {
    durationSec?: number;
    hour?: number;
    minute?: number;
    label?: string;
  }
): void {
  if (typeof window === "undefined") return;

  const label = encodeURIComponent(options.label || "CTU MISSION");

  if (type === "timer" && options.durationSec && options.durationSec > 0) {
    const intentUrl = `intent:#Intent;action=android.intent.action.SET_TIMER;i.android.intent.extra.alarm.LENGTH=${options.durationSec};S.android.intent.extra.alarm.MESSAGE=${label};B.android.intent.extra.alarm.SKIP_UI=true;end`;
    const fallbackUrl = `intent:#Intent;action=android.intent.action.SET_TIMER;i.android.intent.extra.alarm.LENGTH=${options.durationSec};S.android.intent.extra.alarm.MESSAGE=${label};end`;

    try {
      window.location.href = intentUrl;
    } catch {
      try {
        window.location.href = fallbackUrl;
      } catch {}
    }
  } else if (type === "alarm" && typeof options.hour === "number" && typeof options.minute === "number") {
    const intentUrl = `intent:#Intent;action=android.intent.action.SET_ALARM;i.android.intent.extra.alarm.HOUR=${options.hour};i.android.intent.extra.alarm.MINUTES=${options.minute};S.android.intent.extra.alarm.MESSAGE=${label};B.android.intent.extra.alarm.SKIP_UI=true;end`;
    const fallbackUrl = `intent:#Intent;action=android.intent.action.SET_ALARM;i.android.intent.extra.alarm.HOUR=${options.hour};i.android.intent.extra.alarm.MINUTES=${options.minute};S.android.intent.extra.alarm.MESSAGE=${label};end`;

    try {
      window.location.href = intentUrl;
    } catch {
      try {
        window.location.href = fallbackUrl;
      } catch {}
    }
  }
}

// Aliases for compatibility across route revisions
export const initBackgroundAlerts = registerCTUWorker;
export const scheduleLocalAlert = scheduleBackgroundAlert;
export const cancelLocalAlert = cancelBackgroundAlert;
