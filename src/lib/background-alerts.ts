// src/lib/background-alerts.ts — CTU Client-Side Background Alerts, HUD & Phone Intent Wiring

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
}

export async function cancelBackgroundAlert(id: string): Promise<void> {
  removeDeadline(id);
  await postToWorker({
    type: "CANCEL_DEADLINE",
    id,
  });
}

// Wire alarm or timer into native Samsung / Android phone clock
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
    // Android intent to set a native system timer
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
    // Android intent to set a native system alarm
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
