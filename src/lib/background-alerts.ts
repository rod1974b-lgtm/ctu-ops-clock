// src/lib/background-alerts.ts — CTU Client-Side Background Alerts & Push Coordination
// Manages:
//  1) Service Worker registration and communication
//  2) Persistent deadline tracking (localStorage + IndexedDB synchronization)
//  3) Web Push subscription creation for background OS wakeups
//  4) Automatic missed deadline audit on app re-entry

export interface StoredDeadline {
  id: string;
  label: string;
  targetEpochMs: number;
  type: "timer" | "alarm";
  days?: number[] | undefined;
}

export interface PushSubscriptionJSON {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

const DEADLINES_KEY = "ctu_active_deadlines";
const PUSH_SUB_KEY = "ctu_web_push_subscription";
const SW_URL = "/sw.js";

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

// Helper to convert base64 URL VAPID key to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Deadline Storage Management
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

// Service Worker Registration
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

// Dispatch message to active Service Worker safely
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

// Web Push Registration (For waking dark / locked phone screens)
export async function subscribeToWebPush(
  vapidPublicKey?: string
): Promise<PushSubscription | null> {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return null;
  }

  try {
    const registration = await registerCTUWorker();
    if (!registration) return null;

    let subscription = await registration.pushManager.getSubscription();

    if (!subscription && vapidPublicKey) {
      const convertedKey = urlBase64ToUint8Array(vapidPublicKey);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey,
      });
    }

    if (subscription) {
      localStorage.setItem(PUSH_SUB_KEY, JSON.stringify(subscription.toJSON()));
    }

    return subscription;
  } catch (err) {
    console.warn("[CTU] Web Push subscription failed or was refused:", err);
    return null;
  }
}

export function getSavedPushSubscription(): PushSubscriptionJSON | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PUSH_SUB_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// High-level Alert Scheduling API
export async function scheduleBackgroundAlert(input: {
  id: string;
  label: string;
  title: string;
  body: string;
  targetEpochMs: number;
  type: "timer" | "alarm";
  days?: number[] | undefined;
}): Promise<void> {
  upsertDeadline({
    id: input.id,
    label: input.label,
    targetEpochMs: input.targetEpochMs,
    type: input.type,
    days: input.days,
  });

  await postToWorker({
    type: "SCHEDULE_ALERT",
    id: input.id,
    label: input.label,
    title: input.title,
    body: input.body,
    targetEpochMs: input.targetEpochMs,
    epochMs: input.targetEpochMs,
  });
}

export async function cancelBackgroundAlert(id: string): Promise<void> {
  removeDeadline(id);
  await postToWorker({ type: "CANCEL_ALERT", id });
}

// Reschedule all active deadlines & catch up on any missed during sleep
export async function rescheduleAllDeadlines(
  onMissed?: (deadline: StoredDeadline) => void
): Promise<void> {
  const now = Date.now();
  const all = loadDeadlines();

  for (const deadline of all) {
    if (deadline.targetEpochMs <= now) {
      removeDeadline(deadline.id);
      onMissed?.(deadline);
    } else {
      await postToWorker({
        type: "SCHEDULE_ALERT",
        id: deadline.id,
        label: deadline.label,
        title:
          deadline.type === "alarm"
            ? `[CTU ALARM DISPATCH] ${deadline.label.toUpperCase()}`
            : `[CTU CRISIS ALERT] ${deadline.label.toUpperCase()} AT ZERO`,
        body:
          deadline.type === "alarm"
            ? "Scheduled tactical alarm."
            : "Operation reached zero.",
        targetEpochMs: deadline.targetEpochMs,
        epochMs: deadline.targetEpochMs,
      });
    }
  }

  await postToWorker({ type: "CHECK_MISSED" });
}
