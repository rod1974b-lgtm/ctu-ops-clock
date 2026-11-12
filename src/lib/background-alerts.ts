// src/lib/background-alarms.ts — page side of background timers/alarms.
// This is the fix for "nothing fires after I close the app":
//  1) Register the worker ONCE (old code never registered it, so
//     navigator.serviceWorker.controller was null and postMessage went nowhere).
//  2) Store ABSOLUTE deadlines (targetEpochMs), never just remainingSec.
//  3) On every load + every time the tab becomes visible, re-arm ALL deadlines
//     from localStorage and fire anything already missed.

export interface StoredDeadline {
  id: string;
  label: string;
  targetEpochMs: number;
  type: "timer" | "alarm";
  days?: number[];
}

const DEADLINES_KEY = "ctu_active_deadlines";
const SW_URL = "/sw.js";

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function loadDeadlines(): StoredDeadline[] {
  try {
    const raw = localStorage.getItem(DEADLINES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
export function saveDeadlines(list: StoredDeadline[]) {
  try { localStorage.setItem(DEADLINES_KEY, JSON.stringify(list)); } catch {}
}
export function upsertDeadline(d: StoredDeadline) {
  saveDeadlines([...loadDeadlines().filter((x) => x.id !== d.id), d]);
}
export function removeDeadline(id: string) {
  saveDeadlines(loadDeadlines().filter((x) => x.id !== id));
}

export function registerCTUWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return Promise.resolve(null);
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register(SW_URL, { scope: "/" })
      .then((reg) => {
        // If a new worker is waiting (after a deploy), take over immediately.
        if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
        return reg;
      })
      .catch(() => null);
  }
  return registrationPromise;
}

export async function postToWorker(msg: unknown) {
  const reg = await registerCTUWorker();
  if (!reg) return;
  // FIX: old code used navigator.serviceWorker.controller.postMessage()
  // directly — null when the page just loaded / worker not controlling yet,
  // so every schedule silently threw. ready + reg.active is the reliable path.
  const worker = reg.active ?? (await navigator.serviceWorker.ready).active;
  worker?.postMessage(msg);
}

export async function scheduleBackgroundAlert(input: {
  id: string; label: string; title: string; body: string;
  targetEpochMs: number; type: "timer" | "alarm"; days?: number[];
}) {
  upsertDeadline({ id: input.id, label: input.label, targetEpochMs: input.targetEpochMs, type: input.type, days: input.days });
  await postToWorker({
    type: "SCHEDULE_ALERT",
    id: input.id, label: input.label, title: input.title, body: input.body,
    targetEpochMs: input.targetEpochMs,
  });
}

export async function cancelBackgroundAlert(id: string) {
  removeDeadline(id);
  await postToWorker({ type: "CANCEL_ALERT", id });
}

/** Fire anything whose deadline passed while the app was closed, and re-arm the rest. */
export async function rescheduleAllDeadlines(onMissed?: (d: StoredDeadline) => void) {
  const now = Date.now();
  for (const d of loadDeadlines()) {
    if (d.targetEpochMs <= now) {
      removeDeadline(d.id);
      onMissed?.(d);
    } else {
      await postToWorker({
        type: "SCHEDULE_ALERT",
        id: d.id, label: d.label,
        title: d.type === "alarm" ? `[CTU ALARM DISPATCH] ${d.label.toUpperCase()}` : `[CTU CRISIS ALERT] ${d.label.toUpperCase()} AT ZERO`,
        body: d.type === "alarm" ? "Scheduled tactical alarm." : "Operation reached zero.",
        targetEpochMs: d.targetEpochMs,
      });
    }
  }
  await postToWorker({ type: "CHECK_MISSED" });
}
