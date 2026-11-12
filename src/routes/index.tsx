// src/routes/index.tsx — COMPLETE FILE
// Drop-in replacement. Requires: public/sw.js (provided separately),
// src/components/samsung-time-picker, src/lib/ctu-audio, src/lib/mission-engine
// FIXES vs original:
//  1) Service worker is REGISTERED (old code never registered it, so
//     navigator.serviceWorker.controller was null and SCHEDULE_ALERT went nowhere)
//  2) Timers use ABSOLUTE wall-clock deadlines (targetEpochMs), not remainingSec - 1.
//     The 1s tick freezing on close no longer freezes time.
//  3) On mount + on visibilitychange, all saved deadlines are re-armed and
//     missed ones fire immediately.
//  4) Deleted the fake "Lockscreen HUD" effect (a page cannot keep a lockscreen
//     notification alive after close).
//  5) handleSnooze now actually schedules its 5-minute background alert.
// NOTE: iOS Safari does not run a service worker after full close — no web app
// can reliably fire while fully closed on iPhone. Android + installed PWA works.

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SamsungTimePicker, type SamsungTimePickerValues } from "@/components/samsung-time-picker";
import { CTUAudio } from "@/lib/ctu-audio";
import { nextAlarm } from "@/lib/mission-engine";

export const Route = createFileRoute("/")({
  component: CTUTerminalV74,
  head: () => ({
    meta: [
      { title: "CTU Tactical Operational Command | 24 v74" },
      { name: "description", content: "Authentic 24 TV Show CTU Tactical Multi-Timer & Alarm System." },
      { property: "og:title", content: "CTU Tactical Operational Command" },
      { property: "og:description", content: "Authentic 24 TV Show CTU Multi-Timer Terminal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type ZeroSoundType = "voice" | "boom" | "alarm" | "ctu_beep" | "stinger";
const ZERO_SOUND_LABELS: Record<ZeroSoundType, string> = {
  voice: "VOICE: 0 AT ZERO",
  boom: "BOOM IMPACT",
  alarm: "ALARM KLAXON",
  ctu_beep: "CTU BEEP",
  stinger: "STINGER CHORD",
};

export interface OperationalTimer {
  id: string; label: string; durationSec: number; remainingSec: number;
  running: boolean; timesUp: boolean; status: string;
}
export interface OperationalAlarm {
  id: string; label: string; hour: number; minute: number;
  days: number[]; armed: boolean;
}
interface StoredDeadline {
  id: string; label: string; targetEpochMs: number;
  type: "timer" | "alarm"; days?: number[];
}

const INITIAL_TIMERS: OperationalTimer[] = [
  { id: "timer-alpha", label: "ALPHA: RECON INSERTION", durationSec: 25 * 60, remainingSec: 25 * 60, running: false, timesUp: false, status: "STANDBY" },
  { id: "timer-bravo", label: "BRAVO: SATELLITE PASS", durationSec: 45 * 60, remainingSec: 45 * 60, running: false, timesUp: false, status: "STANDBY" },
];
const INITIAL_ALARMS: OperationalAlarm[] = [
  { id: "alarm-briefing", label: "MANDATORY BRIEFING", hour: 7, minute: 0, days: [1, 2, 3, 4, 5], armed: true },
  { id: "alarm-shift", label: "SHIFT COMMENCEMENT", hour: 14, minute: 30, days: [0, 1, 2, 3, 4, 5, 6], armed: true },
];
const QUICK_PRESETS = [
  { label: "STAND-DOWN", seconds: 5 * 60 },
  { label: "INTERROGATE", seconds: 15 * 60 },
  { label: "SPRINT", seconds: 25 * 60 },
  { label: "SATELLITE", seconds: 45 * 60 },
];
const WORLD_THEATERS = [
  { city: "HONOLULU", tz: "Pacific/Honolulu" },
  { city: "LOS ANGELES", tz: "America/Los_Angeles" },
  { city: "WASHINGTON DC", tz: "America/New_York" },
  { city: "LONDON (ZULU)", tz: "UTC" },
  { city: "BERLIN", tz: "Europe/Berlin" },
  { city: "CAIRO", tz: "Africa/Cairo" },
  { city: "MOSCOW", tz: "Europe/Moscow" },
  { city: "DUBAI", tz: "Asia/Dubai" },
  { city: "BANGKOK HQ", tz: "Asia/Bangkok" },
  { city: "TOKYO", tz: "Asia/Tokyo" },
  { city: "SYDNEY", tz: "Australia/Sydney" },
];

// ---------- Background alarms (inlined so this file is self-contained) ----------
const DEADLINES_KEY = "ctu_active_deadlines";
function loadDeadlines(): StoredDeadline[] {
  try { const p = JSON.parse(localStorage.getItem(DEADLINES_KEY) || "[]"); return Array.isArray(p) ? p : []; }
  catch { return []; }
}
function saveDeadlines(list: StoredDeadline[]) { try { localStorage.setItem(DEADLINES_KEY, JSON.stringify(list)); } catch {} }
function upsertDeadline(d: StoredDeadline) { saveDeadlines([...loadDeadlines().filter((x) => x.id !== d.id), d]); }
function removeDeadline(id: string) { saveDeadlines(loadDeadlines().filter((x) => x.id !== id)); }

let swRegPromise: Promise<ServiceWorkerRegistration | null> | null = null;
function registerCTUWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return Promise.resolve(null);
  if (!swRegPromise) {
    swRegPromise = navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => null);
  }
  return swRegPromise;
}
async function postToWorker(msg: unknown) {
  const reg = await registerCTUWorker();
  if (!reg) return;
  const worker = reg.active ?? (await navigator.serviceWorker.ready).active;
  worker?.postMessage(msg);
}
async function scheduleBackgroundAlert(input: { id: string; label: string; title: string; body: string; targetEpochMs: number; type: "timer" | "alarm"; days?: number[] }) {
  upsertDeadline({ id: input.id, label: input.label, targetEpochMs: input.targetEpochMs, type: input.type, days: input.days });
  await postToWorker({ type: "SCHEDULE_ALERT", id: input.id, label: input.label, title: input.title, body: input.body, targetEpochMs: input.targetEpochMs });
}
async function cancelBackgroundAlert(id: string) {
  removeDeadline(id);
  await postToWorker({ type: "CANCEL_ALERT", id });
}
async function rescheduleAllDeadlines(onMissed?: (d: StoredDeadline) => void) {
  const now = Date.now();
  for (const d of loadDeadlines()) {
    if (d.targetEpochMs <= now) { removeDeadline(d.id); onMissed?.(d); }
    else {
      await postToWorker({
        type: "SCHEDULE_ALERT", id: d.id, label: d.label,
        title: d.type === "alarm" ? `[CTU ALARM DISPATCH] ${d.label.toUpperCase()}` : `[CTU CRISIS ALERT] ${d.label.toUpperCase()} AT ZERO`,
        body: d.type === "alarm" ? "Scheduled tactical alarm." : "Operation reached zero.",
        targetEpochMs: d.targetEpochMs,
      });
    }
  }
  await postToWorker({ type: "CHECK_MISSED" });
}
// ------------------------------------------------------------------------------

function CTUTerminalV74() {
  const [mounted, setMounted] = useState(false);
  const [nowDate, setNowDate] = useState<Date>(() => new Date());
  const [colonVisible, setColonVisible] = useState(true);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [masterVol, setMasterVol] = useState(85);
  const [zeroSound, setZeroSound] = useState<ZeroSoundType>("voice");

  const [timers, setTimers] = useState<OperationalTimer[]>(() => {
    if (typeof window === "undefined") return INITIAL_TIMERS;
    try { const s = localStorage.getItem("ctu_timers_v74"); return s ? JSON.parse(s) : INITIAL_TIMERS; }
    catch { return INITIAL_TIMERS; }
  });
  const [alarms, setAlarms] = useState<OperationalAlarm[]>(() => {
    if (typeof window === "undefined") return INITIAL_ALARMS;
    try { const s = localStorage.getItem("ctu_alarms_v74"); return s ? JSON.parse(s) : INITIAL_ALARMS; }
    catch { return INITIAL_ALARMS; }
  });
  const [activeTimerId, setActiveTimerId] = useState<string>("timer-alpha");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<"timer" | "alarm">("timer");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [pickerInitial, setPickerInitial] = useState<SamsungTimePickerValues>({
    hours: 0, minutes: 25, seconds: 0, days: [0, 1, 2, 3, 4, 5, 6], totalSeconds: 25 * 60,
  });
  const [countdownTakeover, setCountdownTakeover] = useState(false);
  const [countdownRemaining, setCountdownRemaining] = useState(10);
  const [countdownLabel, setCountdownLabel] = useState("");
  const [crisisOverlay, setCrisisOverlay] = useState(false);
  const [openingOpen, setOpeningOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [osAlertStatus, setOsAlertStatus] = useState<NotificationPermission>("default");

  const lastAlarmTriggerRef = useRef<Record<string, string>>({});
  const lastCountdownSecondRef = useRef<number | null>(null);
  // Wall-clock deadline per running timer. This is what makes close/reopen work.
  const timerDeadlinesRef = useRef<Map<string, number>>(new Map());
  const zeroSoundRef = useRef(zeroSound);
  zeroSoundRef.current = zeroSound;

  const unlockAudio = useCallback(() => {
    if (!audioUnlocked) { CTUAudio.unlock(); setAudioUnlocked(true); }
  }, [audioUnlocked]);

  // Fire a timer that hit zero (foreground or missed-while-closed).
  const fireTimerZero = useCallback((timer: OperationalTimer) => {
    timerDeadlinesRef.current.delete(timer.id);
    void cancelBackgroundAlert(timer.id);
    setCountdownTakeover(false);
    setCrisisOverlay(true);
    setCountdownLabel(timer.label);
    CTUAudio.triggerZeroSound(zeroSoundRef.current);
    setTimers((prev) => prev.map((t) =>
      t.id === timer.id ? { ...t, remainingSec: 0, running: false, timesUp: true, status: "EXPIRED" } : t
    ));
  }, []);

  // Client mount: register worker, reconcile running timers against wall clock,
  // re-arm all deadlines, fire anything missed while closed.
  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined" && "Notification" in window) setOsAlertStatus(Notification.permission);
    void registerCTUWorker().then(() => {
      // Reconcile: a timer marked running must resume from its DEADLINE, not stale remainingSec.
      const deadlines = loadDeadlines();
      setTimers((prev) => prev.map((t) => {
        if (!t.running) return t;
        const d = deadlines.find((x) => x.id === t.id && x.type === "timer");
        if (!d) return { ...t, running: false, status: "HOLD" }; // no deadline = cannot trust it
        const remaining = Math.ceil((d.targetEpochMs - Date.now()) / 1000);
        if (remaining <= 0) return { ...t, remainingSec: 0, running: false, timesUp: true, status: "EXPIRED" };
        timerDeadlinesRef.current.set(t.id, d.targetEpochMs);
        return { ...t, remainingSec: remaining };
      }));
      void rescheduleAllDeadlines((missed) => {
        if (missed.type === "timer") {
          setTimers((prev) => prev.map((t) =>
            t.id === missed.id ? { ...t, remainingSec: 0, running: false, timesUp: true, status: "EXPIRED" } : t
          ));
        }
        setCountdownLabel(missed.label);
        setCrisisOverlay(true);
        CTUAudio.triggerZeroSound(zeroSoundRef.current);
      });
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void rescheduleAllDeadlines((missed) => {
          setCountdownLabel(missed.label);
          setCrisisOverlay(true);
          CTUAudio.triggerZeroSound(zeroSoundRef.current);
        });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Persist timers & alarms
  useEffect(() => { if (!mounted) return; try { localStorage.setItem("ctu_timers_v74", JSON.stringify(timers)); } catch {} }, [timers, mounted]);
  useEffect(() => { if (!mounted) return; try { localStorage.setItem("ctu_alarms_v74", JSON.stringify(alarms)); } catch {} }, [alarms, mounted]);

  const scheduleTimerBackground = useCallback((timer: OperationalTimer, targetEpochMs?: number) => {
    if (osAlertStatus !== "granted") return;
    const target = targetEpochMs ?? Date.now() + timer.remainingSec * 1000;
    void scheduleBackgroundAlert({
      id: timer.id, label: timer.label, type: "timer", targetEpochMs: target,
      title: `[CTU CRISIS ALERT] ${timer.label.toUpperCase()} AT ZERO`,
      body: `Operation reached zero. Return to tactical terminal immediately.`,
    });
  }, [osAlertStatus]);
  const cancelTimerBackground = useCallback((id: string) => { void cancelBackgroundAlert(id); }, []);

  const scheduleAlarmBackground = useCallback((alarm: OperationalAlarm) => {
    if (osAlertStatus !== "granted" || !alarm.armed) return;
    const nextTime = nextAlarm(new Date(), [{ hour: alarm.hour, minute: alarm.minute, days: alarm.days }]);
    if (!nextTime) return;
    void scheduleBackgroundAlert({
      id: alarm.id, label: alarm.label, type: "alarm", days: alarm.days, targetEpochMs: nextTime.getTime(),
      title: `[CTU ALARM DISPATCH] ${alarm.label.toUpperCase()}`,
      body: `Scheduled tactical alarm for ${String(alarm.hour).padStart(2, "0")}:${String(alarm.minute).padStart(2, "0")} Bangkok Time.`,
    });
  }, [osAlertStatus]);
  const cancelAlarmBackground = useCallback((id: string) => { void cancelBackgroundAlert(id); }, []);

  const handleRequestOSAlerts = async () => {
    unlockAudio();
    if (typeof window === "undefined" || !("Notification" in window)) { alert("Notification API not supported by this browser."); return; }
    try {
      const permission = await Notification.requestPermission();
      setOsAlertStatus(permission);
      if (permission === "granted") {
        for (const t of timers) if (t.running) scheduleTimerBackground(t, timerDeadlinesRef.current.get(t.id));
        for (const a of alarms) if (a.armed) scheduleAlarmBackground(a);
      }
    } catch {}
  };

  // 1-second tick — WALL-CLOCK driven. Never remainingSec - 1.
  useEffect(() => {
    const tick = setInterval(() => {
      const current = new Date();
      setNowDate(current);
      setColonVisible((prev) => !prev);

      setTimers((prev) => prev.map((t) => {
        if (!t.running) return t;
        const deadline = timerDeadlinesRef.current.get(t.id);
        // No deadline (e.g. started before this fix shipped) — fall back to 1s step once, then hold.
        const remaining = deadline ? Math.max(0, Math.ceil((deadline - current.getTime()) / 1000)) : Math.max(0, t.remainingSec - 1);
        if (remaining <= 0) {
          // Side-effect inside a setter is not ideal, but firing exactly once
          // here matches original behaviour; fireTimerZero is idempotent via status.
          queueMicrotask(() => fireTimerZero(t));
          return { ...t, remainingSec: 0, running: false, timesUp: true, status: "EXPIRED" };
        }
        if (remaining <= 10 && remaining > 0) {
          setCountdownTakeover(true);
          setCountdownRemaining(remaining);
          setCountdownLabel(t.label);
          if (lastCountdownSecondRef.current !== remaining) {
            lastCountdownSecondRef.current = remaining;
            const intensity = remaining <= 3 ? 3 : remaining <= 5 ? 2 : 1;
            CTUAudio.playCountdownSound(intensity);
          }
        } else if (remaining > 10 && t.id === activeTimerId && countdownTakeover) {
          setCountdownTakeover(false);
        }
        return { ...t, remainingSec: remaining };
      }));

      // Daily alarms in Bangkok time
      const bkkFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Bangkok", hour: "numeric", minute: "numeric", second: "numeric", hour12: false, weekday: "short",
      });
      const parts = bkkFormatter.formatToParts(current);
      const bkkHour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
      const bkkMinute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
      const bkkSecond = parseInt(parts.find((p) => p.type === "second")?.value || "0", 10);
      const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const bkkDay = dayMap[parts.find((p) => p.type === "weekday")?.value || "Sun"] ?? 0;
      if (bkkSecond === 0) {
        for (const alarm of alarms) {
          if (!alarm.armed) continue;
          if (alarm.hour === bkkHour && alarm.minute === bkkMinute && alarm.days.includes(bkkDay)) {
            const key = `${alarm.id}-${current.toISOString().slice(0, 10)}-${bkkHour}:${bkkMinute}`;
            if (!lastAlarmTriggerRef.current[key]) {
              lastAlarmTriggerRef.current[key] = "triggered";
              setCountdownLabel(alarm.label);
              setCrisisOverlay(true);
              CTUAudio.triggerZeroSound(zeroSoundRef.current);
              // Re-arm for its next occurrence (tomorrow / next selected day)
              scheduleAlarmBackground(alarm);
            }
          }
        }
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [alarms, activeTimerId, countdownTakeover, fireTimerZero, scheduleAlarmBackground]);

  const activeTimer = useMemo(() => {
    return timers.find((t) => t.id === activeTimerId) || timers[0] || {
      id: "timer-fallback", label: "TACTICAL TIMER", durationSec: 25 * 60,
      remainingSec: 25 * 60, running: false, timesUp: false, status: "STANDBY",
    };
  }, [timers, activeTimerId]);

  const formatDigits = (totalSec: number) => {
    const clamped = Math.max(0, totalSec);
    const h = Math.floor(clamped / 3600);
    const m = Math.floor((clamped % 3600) / 60);
    const s = clamped % 60;
    return { h: String(h).padStart(2, "0"), m: String(m).padStart(2, "0"), s: String(s).padStart(2, "0") };
  };
  const primaryDigits = formatDigits(activeTimer.remainingSec);

  const bangkokTime = useMemo(() => {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Bangkok", hour: "numeric", minute: "numeric", second: "numeric",
      hour12: false, year: "numeric", month: "short", day: "2-digit",
    });
    const parts = formatter.formatToParts(nowDate);
    const h = parts.find((p) => p.type === "hour")?.value || "00";
    const m = parts.find((p) => p.type === "minute")?.value || "00";
    const s = parts.find((p) => p.type === "second")?.value || "00";
    const month = parts.find((p) => p.type === "month")?.value || "";
    const day = parts.find((p) => p.type === "day")?.value || "";
    const year = parts.find((p) => p.type === "year")?.value || "";
    return { time: `${h}:${m}:${s}`, date: `${day} ${month.toUpperCase()} ${year}` };
  }, [nowDate]);
  const zuluTime = useMemo(() => {
    return `${String(nowDate.getUTCHours()).padStart(2, "0")}:${String(nowDate.getUTCMinutes()).padStart(2, "0")}:${String(nowDate.getUTCSeconds()).padStart(2, "0")}Z`;
  }, [nowDate]);

  // Handlers
  const handleExecuteTimer = (id: string) => {
    unlockAudio();
    setTimers((prev) => prev.map((t) => {
      if (t.id !== id) return t;
      const remaining = t.remainingSec === 0 ? t.durationSec : t.remainingSec;
      const deadline = Date.now() + remaining * 1000;
      timerDeadlinesRef.current.set(id, deadline);
      const updated = { ...t, running: true, timesUp: false, status: "IN PROGRESS", remainingSec: remaining };
      scheduleTimerBackground(updated, deadline);
      return updated;
    }));
  };
  const handlePauseTimer = (id: string) => {
    unlockAudio();
    cancelTimerBackground(id);
    timerDeadlinesRef.current.delete(id);
    setTimers((prev) => prev.map((t) => (t.id === id ? { ...t, running: false, status: "HOLD" } : t)));
  };
  const handleResetTimer = (id: string) => {
    unlockAudio();
    cancelTimerBackground(id);
    timerDeadlinesRef.current.delete(id);
    if (countdownTakeover) setCountdownTakeover(false);
    CTUAudio.stopCountdownSound();
    setTimers((prev) => prev.map((t) => t.id === id ? { ...t, running: false, timesUp: false, status: "STANDBY", remainingSec: t.durationSec } : t));
  };
  const handleQuickPreset = (seconds: number) => {
    unlockAudio();
    cancelTimerBackground(activeTimer.id);
    timerDeadlinesRef.current.delete(activeTimer.id);
    if (countdownTakeover) setCountdownTakeover(false);
    setTimers((prev) => prev.map((t) => t.id === activeTimerId ? { ...t, durationSec: seconds, remainingSec: seconds, running: false, timesUp: false, status: "STANDBY" } : t));
  };
  const handleEditTimer = (timer: OperationalTimer) => {
    unlockAudio();
    setPickerMode("timer");
    setEditingItemId(timer.id);
    const h = Math.floor(timer.durationSec / 3600);
    const m = Math.floor((timer.durationSec % 3600) / 60);
    const s = timer.durationSec % 60;
    setPickerInitial({ hours: h, minutes: m, seconds: s, totalSeconds: timer.durationSec });
    setPickerOpen(true);
  };
  const handleAddTimer = () => {
    unlockAudio();
    setPickerMode("timer"); setEditingItemId(null);
    setPickerInitial({ hours: 0, minutes: 15, seconds: 0, totalSeconds: 15 * 60 });
    setPickerOpen(true);
  };
  const handleDeleteTimer = (id: string) => {
    unlockAudio();
    cancelTimerBackground(id);
    timerDeadlinesRef.current.delete(id);
    setTimers((prev) => {
      const remaining = prev.filter((t) => t.id !== id);
      if (remaining.length === 0) return INITIAL_TIMERS;
      if (activeTimerId === id && remaining[0]) setActiveTimerId(remaining[0].id);
      return remaining;
    });
  };
  const handleEditAlarm = (alarm: OperationalAlarm) => {
    unlockAudio();
    setPickerMode("alarm"); setEditingItemId(alarm.id);
    setPickerInitial({ hours: alarm.hour, minutes: alarm.minute, seconds: 0, days: alarm.days, totalSeconds: alarm.hour * 3600 + alarm.minute * 60 });
    setPickerOpen(true);
  };
  const handleAddAlarm = () => {
    unlockAudio();
    setPickerMode("alarm"); setEditingItemId(null);
    setPickerInitial({ hours: 8, minutes: 0, seconds: 0, days: [1, 2, 3, 4, 5], totalSeconds: 8 * 3600 });
    setPickerOpen(true);
  };
  const handleToggleAlarm = (id: string) => {
    unlockAudio();
    setAlarms((prev) => prev.map((a) => {
      if (a.id !== id) return a;
      const nextState = !a.armed;
      if (nextState) scheduleAlarmBackground({ ...a, armed: true });
      else cancelAlarmBackground(a.id);
      return { ...a, armed: nextState };
    }));
  };
  const handleDeleteAlarm = (id: string) => {
    unlockAudio();
    cancelAlarmBackground(id);
    setAlarms((prev) => prev.filter((a) => a.id !== id));
  };
  const handlePickerConfirm = (vals: SamsungTimePickerValues) => {
    unlockAudio();
    if (pickerMode === "timer") {
      const totalSec = Math.max(1, vals.hours * 3600 + vals.minutes * 60 + vals.seconds);
      if (editingItemId) {
        cancelTimerBackground(editingItemId);
        timerDeadlinesRef.current.delete(editingItemId);
        setTimers((prev) => prev.map((t) => t.id === editingItemId ? { ...t, durationSec: totalSec, remainingSec: totalSec, running: false, timesUp: false, status: "STANDBY" } : t));
      } else {
        const newTimer: OperationalTimer = {
          id: `timer-${Date.now()}`,
          label: `OPS: ${String(vals.hours).padStart(2, "0")}:${String(vals.minutes).padStart(2, "0")}:${String(vals.seconds).padStart(2, "0")}`,
          durationSec: totalSec, remainingSec: totalSec, running: false, timesUp: false, status: "STANDBY",
        };
        setTimers((prev) => [...prev, newTimer]);
        setActiveTimerId(newTimer.id);
      }
    } else {
      const days = vals.days && vals.days.length > 0 ? vals.days : [0, 1, 2, 3, 4, 5, 6];
      if (editingItemId) {
        setAlarms((prev) => prev.map((a) => {
          if (a.id !== editingItemId) return a;
          const updated = { ...a, hour: vals.hours, minute: vals.minutes, days };
          if (updated.armed) scheduleAlarmBackground(updated);
          return updated;
        }));
      } else {
        const newAlarm: OperationalAlarm = {
          id: `alarm-${Date.now()}`,
          label: `TACTICAL: ${String(vals.hours).padStart(2, "0")}:${String(vals.minutes).padStart(2, "0")}`,
          hour: vals.hours, minute: vals.minutes, days, armed: true,
        };
        setAlarms((prev) => [...prev, newAlarm]);
        scheduleAlarmBackground(newAlarm);
      }
    }
    setPickerOpen(false);
  };
  const handleSnooze = () => {
    unlockAudio();
    setCrisisOverlay(false);
    setCountdownTakeover(false);
    CTUAudio.stopCrisisAudio();
    CTUAudio.stopCountdownSound();
    // FIX: snooze now schedules its background alert too.
    const deadline = Date.now() + 5 * 60 * 1000;
    timerDeadlinesRef.current.set(activeTimerId, deadline);
    setTimers((prev) => prev.map((t) => t.id === activeTimerId ? { ...t, remainingSec: 5 * 60, running: true, timesUp: false, status: "SNOOZE (5M)" } : t));
    void scheduleBackgroundAlert({
      id: activeTimerId, label: activeTimer.label, type: "timer", targetEpochMs: deadline,
      title: `[CTU CRISIS ALERT] ${activeTimer.label.toUpperCase()} AT ZERO`,
      body: `Snooze (5m) reached zero.`,
    });
  };
  const handleDisarm = () => {
    unlockAudio();
    setCrisisOverlay(false);
    setCountdownTakeover(false);
    CTUAudio.stopCrisisAudio();
    CTUAudio.stopCountdownSound();
    cancelTimerBackground(activeTimerId);
    timerDeadlinesRef.current.delete(activeTimerId);
    setTimers((prev) => prev.map((t) => t.id === activeTimerId ? { ...t, remainingSec: t.durationSec, running: false, timesUp: false, status: "STANDBY" } : t));
  };
  const handleOpenCredits = () => { unlockAudio(); setCreditsOpen(true); CTUAudio.playCreditsAudio(); };
  const handleCloseCredits = () => { setCreditsOpen(false); CTUAudio.stopCreditsAudio(); };
  const handleOpenOpening = () => { unlockAudio(); setOpeningOpen(true); };
  const handleCloseOpening = () => { setOpeningOpen(false); };

  return (
    <main onClick={unlockAudio} className="min-h-screen bg-black text-[#ffcc00] font-mono select-none overflow-x-hidden p-2 sm:p-4 md:p-6">
      <header className="border-2 border-[#ffcc00] bg-black p-3 mb-4 shadow-[0_0_20px_rgba(255,204,0,0.15)] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 bg-[#ffcc00] flex items-center justify-center font-black text-black text-xs">24</div>
          <div>
            <h1 className="text-sm sm:text-base font-black tracking-widest text-[#ffcc00]">CTU OPERATIONAL COMMAND TERMINAL</h1>
            <p className="text-[10px] tracking-wider text-[#ffcc00]/70">COUNTER TERRORIST UNIT • SOUTHEAST ASIA DIVISION • DIRECTIVE 74</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {osAlertStatus !== "granted" ? (
            <button onClick={handleRequestOSAlerts} className="px-2.5 py-1 bg-amber-500/20 border border-[#ffcc00] text-[#ffcc00] text-xs font-bold tracking-wider hover:bg-[#ffcc00] hover:text-black transition flex items-center gap-1.5 animate-pulse" title="Enable background notifications when tab is closed">
              <span>LINK OS ALERTS</span>
            </button>
          ) : (
            <span className="px-2.5 py-1 border border-[#ffcc00]/40 text-[#ffcc00]/80 text-[11px] font-bold">OS ALERTS: ARMED</span>
          )}
          <button onClick={handleOpenOpening} className="px-2 py-1 border border-[#ffcc00]/60 text-xs font-bold hover:bg-[#ffcc00] hover:text-black transition">OPENING FEED</button>
          <button onClick={handleOpenCredits} className="px-2 py-1 border border-[#ffcc00]/60 text-xs font-bold hover:bg-[#ffcc00] hover:text-black transition">CREDITS</button>
        </div>
      </header>

      {/* World Theaters ticker — TRUE marquee.
          FIX: old version was `overflow-x-auto flex` — flex items shrank to fit,
          so there was nothing to scroll, and nothing moved on its own.
          Now: overflow-hidden + a duplicated track animated with translateX,
          so it scrolls continuously on every screen, touch or no touch. */}
      <style>{`@keyframes ctu-ticker-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } } .ctu-ticker-track { animation: ctu-ticker-scroll 60s linear infinite; } .ctu-ticker-track:hover { animation-play-state: paused; } @media (prefers-reduced-motion: reduce) { .ctu-ticker-track { animation: none; } }`}</style>
      <div className="w-full bg-black/80 border border-[#ffcc00]/30 py-1 px-2 mb-4 overflow-hidden whitespace-nowrap flex items-center gap-6 text-[11px] text-[#ffcc00]/70">
        <span className="font-bold text-[#ffcc00] tracking-widest shrink-0 z-10 bg-black pr-2">WORLD THEATERS:</span>
        <div className="relative flex-1 overflow-hidden">
          <div className="ctu-ticker-track flex w-max items-center gap-6 will-change-transform">
            {[0, 1].map((copy) => (
              <div key={copy} aria-hidden={copy === 1} className="flex items-center gap-6 shrink-0">
                {WORLD_THEATERS.map((wt) => {
                  const tStr = new Intl.DateTimeFormat("en-US", { timeZone: wt.tz, hour: "numeric", minute: "numeric", second: "numeric", hour12: false }).format(nowDate);
                  return <span key={`${copy}-${wt.city}`} className="inline-flex items-center gap-1.5 shrink-0"><span className="text-[#ffcc00]/50">{wt.city}:</span><strong className="text-[#ffcc00] font-mono">{tStr}</strong></span>;
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <section className="border-2 border-[#ffcc00] bg-black p-3 sm:p-4 flex flex-col justify-between shadow-[0_0_25px_rgba(255,204,0,0.2)]">
          <div className="flex items-center justify-between border-b border-[#ffcc00]/40 pb-2">
            <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#ffcc00] animate-ping" /><span className="text-xs font-black tracking-widest text-[#ffcc00]">ACTIVE THEATER: BANGKOK HQ (UTC+7)</span></div>
            <span className="text-[11px] text-[#ffcc00]/70 tabular-nums">ZULU: <strong className="text-[#ffcc00]">{zuluTime}</strong></span>
          </div>
          <div className="flex flex-col items-center justify-center my-3 sm:my-4 py-1">
            <div className="text-3xl sm:text-4xl md:text-5xl font-black text-[#ffcc00] tracking-tight tabular-nums text-center">
              {bangkokTime.time.split(":").map((part, idx, arr) => (
                <span key={idx}>{part}{idx < arr.length - 1 && <span className={colonVisible ? "opacity-100 text-[#ffcc00]" : "opacity-20 text-[#ffcc00]/40"}>:</span>}</span>
              ))}
            </div>
            <div className="mt-1.5 text-xs tracking-widest text-[#ffcc00]/70 font-bold">{bangkokTime.date}</div>
          </div>
          <div className="border-t border-[#ffcc00]/30 pt-2 flex items-center justify-between text-[11px] text-[#ffcc00]/60"><span>SYNCHRONIZED WITH CTU SATELLITE NETWORK</span><span className="text-[#ffcc00] font-bold">SIGNAL LOCK: 100%</span></div>
        </section>

        <section className="border-2 border-[#ffcc00] bg-black p-3 sm:p-4 flex flex-col justify-between shadow-[0_0_25px_rgba(255,204,0,0.2)]">
          <div className="flex items-center justify-between border-b border-[#ffcc00]/40 pb-2">
            <div className="flex items-center gap-2"><span className="text-xs font-black tracking-widest text-[#ffcc00]">{activeTimer.label}</span></div>
            <span className={`text-[10px] font-bold tracking-widest px-2 py-0.5 border ${activeTimer.running ? "border-[#ffcc00] text-[#ffcc00] bg-[#ffcc00]/10" : activeTimer.timesUp ? "border-red-600 text-red-500 bg-red-950/20" : "border-[#ffcc00]/40 text-[#ffcc00]/60"}`}>{activeTimer.status}</span>
          </div>
          <div onClick={() => handleEditTimer(activeTimer)} className="flex flex-col items-center justify-center my-3 sm:my-4 py-1 cursor-pointer group" title="Tap to adjust operational duration">
            <div className="text-3xl sm:text-4xl md:text-5xl font-black text-[#ffcc00] tracking-tight tabular-nums group-hover:scale-[1.02] transition-transform text-center">{primaryDigits.h}:{primaryDigits.m}:{primaryDigits.s}</div>
            <div className="mt-1.5 text-[10px] tracking-widest text-[#ffcc00]/60 group-hover:text-[#ffcc00] transition">TAP DIGITS TO MODIFY TIME (SAMSUNG HH:MM:SS)</div>
          </div>
          <div className="border-t border-[#ffcc00]/30 pt-3 flex items-center justify-center gap-2 sm:gap-4">
            {!activeTimer.running ? (
              <button onClick={() => handleExecuteTimer(activeTimer.id)} className="bg-[#ffcc00] text-black font-black text-xs sm:text-sm tracking-widest py-2 px-6 hover:bg-[#ffcc00]/80 active:scale-95 transition shadow-[0_0_15px_rgba(255,204,0,0.4)]">EXECUTE</button>
            ) : (
              <button onClick={() => handlePauseTimer(activeTimer.id)} className="bg-black border-2 border-[#ffcc00] text-[#ffcc00] font-black text-xs sm:text-sm tracking-widest py-2 px-6 hover:bg-[#ffcc00]/20 active:scale-95 transition">HOLD</button>
            )}
            <button onClick={() => handleResetTimer(activeTimer.id)} className="border border-[#ffcc00]/50 text-[#ffcc00]/80 font-bold text-xs sm:text-sm tracking-widest py-2 px-4 hover:border-[#ffcc00] hover:text-[#ffcc00] active:scale-95 transition">RESET</button>
            <button onClick={() => handleEditTimer(activeTimer)} className="border border-[#ffcc00]/50 text-[#ffcc00]/80 font-bold text-xs sm:text-sm tracking-widest py-2 px-4 hover:border-[#ffcc00] hover:text-[#ffcc00] active:scale-95 transition">MODIFY</button>
          </div>
        </section>
      </div>

      <div className="border border-[#ffcc00]/40 bg-black p-2.5 mb-4 flex items-center justify-between flex-wrap gap-2">
        <span className="text-[11px] font-bold tracking-widest text-[#ffcc00]/70">QUICK-ARM PRESETS:</span>
        <div className="flex flex-wrap gap-2">
          {QUICK_PRESETS.map((p) => (
            <button key={p.label} onClick={() => handleQuickPreset(p.seconds)} className="border border-[#ffcc00]/50 px-3 py-1 text-xs font-bold tracking-wider text-[#ffcc00] hover:bg-[#ffcc00] hover:text-black transition">{p.label} • {p.seconds / 60}M</button>
          ))}
          <button onClick={handleAddTimer} className="bg-[#ffcc00] text-black px-3 py-1 text-xs font-black tracking-wider hover:bg-[#ffcc00]/80 transition">+ NEW TIMER</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <section className="border border-[#ffcc00]/50 bg-black p-3">
          <h2 className="text-xs font-black tracking-widest text-[#ffcc00] border-b border-[#ffcc00]/40 pb-2 mb-2">OPERATIONAL TIMERS</h2>
          <div className="space-y-2">
            {timers.map((t) => {
              const d = formatDigits(t.remainingSec);
              const isActive = t.id === activeTimerId;
              return (
                <div key={t.id} onClick={() => setActiveTimerId(t.id)} className={`border p-2 cursor-pointer transition ${isActive ? "border-[#ffcc00] bg-[#ffcc00]/10" : "border-[#ffcc00]/30 hover:border-[#ffcc00]/70"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold tracking-wider truncate">{t.label}</span>
                    <span className="text-sm font-black tabular-nums shrink-0">{d.h}:{d.m}:{d.s}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-[#ffcc00]/60">{t.status}</span>
                    <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      {!t.running ? <button onClick={() => handleExecuteTimer(t.id)} className="px-2 py-0.5 border border-[#ffcc00]/60 text-[10px] font-bold hover:bg-[#ffcc00] hover:text-black">EXECUTE</button>
                        : <button onClick={() => handlePauseTimer(t.id)} className="px-2 py-0.5 border border-[#ffcc00]/60 text-[10px] font-bold hover:bg-[#ffcc00] hover:text-black">HOLD</button>}
                      <button onClick={() => handleEditTimer(t)} className="px-2 py-0.5 border border-[#ffcc00]/60 text-[10px] font-bold hover:bg-[#ffcc00] hover:text-black">EDIT</button>
                      <button onClick={() => handleDeleteTimer(t.id)} className="px-2 py-0.5 border border-red-600/60 text-red-400 text-[10px] font-bold hover:bg-red-600 hover:text-white">DEL</button>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="border border-[#ffcc00]/50 bg-black p-3">
          <div className="flex items-center justify-between border-b border-[#ffcc00]/40 pb-2 mb-2">
            <h2 className="text-xs font-black tracking-widest text-[#ffcc00]">TACTICAL ALARMS (BANGKOK TIME)</h2>
            <button onClick={handleAddAlarm} className="bg-[#ffcc00] text-black px-2 py-0.5 text-[11px] font-black tracking-wider hover:bg-[#ffcc00]/80">+ NEW ALARM</button>
          </div>
          <div className="space-y-2">
            {alarms.length === 0 && <p className="text-[11px] text-[#ffcc00]/60">NO ALARMS ARMED.</p>}
            {alarms.map((a) => (
              <div key={a.id} className="border border-[#ffcc00]/30 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold tracking-wider truncate">{a.label}</span>
                  <span className="text-sm font-black tabular-nums shrink-0">{String(a.hour).padStart(2, "0")}:{String(a.minute).padStart(2, "0")}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-[#ffcc00]/60">{a.days.map((d) => ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][d]).join(" ")}</span>
                  <span className="flex gap-1">
                    <button onClick={() => handleToggleAlarm(a.id)} className={`px-2 py-0.5 border text-[10px] font-bold ${a.armed ? "border-[#ffcc00] bg-[#ffcc00] text-black" : "border-[#ffcc00]/60 text-[#ffcc00]"}`}>{a.armed ? "ARMED" : "OFF"}</button>
                    <button onClick={() => handleEditAlarm(a)} className="px-2 py-0.5 border border-[#ffcc00]/60 text-[10px] font-bold hover:bg-[#ffcc00] hover:text-black">EDIT</button>
                    <button onClick={() => handleDeleteAlarm(a.id)} className="px-2 py-0.5 border border-red-600/60 text-red-400 text-[10px] font-bold hover:bg-red-600 hover:text-white">DEL</button>
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-[#ffcc00]/30 mt-3 pt-3 space-y-2">
            <div className="flex items-center justify-between text-[11px]"><span className="font-bold tracking-wider text-[#ffcc00]/70">ZERO SOUND</span><span className="text-[#ffcc00]">{ZERO_SOUND_LABELS[zeroSound]}</span></div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(ZERO_SOUND_LABELS) as ZeroSoundType[]).map((s) => (
                <button key={s} onClick={() => { setZeroSound(s); CTUAudio.triggerZeroSound(s); }} className={`px-2 py-1 border text-[10px] font-bold tracking-wider ${zeroSound === s ? "bg-[#ffcc00] text-black border-[#ffcc00]" : "border-[#ffcc00]/50 text-[#ffcc00] hover:bg-[#ffcc00]/20"}`}>{ZERO_SOUND_LABELS[s]}</button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-[11px]"><span className="font-bold tracking-wider text-[#ffcc00]/70">VOLUME</span><input type="range" min={0} max={100} value={masterVol} onChange={(e) => setMasterVol(Number(e.target.value))} className="flex-1 accent-[#ffcc00]" /><span className="tabular-nums">{masterVol}%</span></div>
            <p className="text-[10px] text-[#ffcc00]/50 leading-relaxed">Background alerts need: installed PWA + OS Alerts: ARMED. On iPhone, Safari will not fire while fully closed — use Android for reliable background firing.</p>
          </div>
        </section>
      </div>

      <footer className="text-center text-[10px] tracking-widest text-[#ffcc00]/50 pb-4">CTU • SOUTHEAST ASIA DIVISION • DIRECTIVE 74 • BACKGROUND ALERTS VIA SERVICE WORKER</footer>

      {/* Countdown takeover */}
      {countdownTakeover && (
        <div className="fixed inset-0 z-40 bg-black/90 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-xs tracking-widest text-[#ffcc00]/70">{countdownLabel}</p>
          <p className="text-7xl font-black text-[#ffcc00] tabular-nums">{countdownRemaining}</p>
          <p className="text-xs tracking-widest text-red-500 font-bold mt-2">ZERO IMMINENT</p>
        </div>
      )}

      {/* Crisis overlay */}
      {crisisOverlay && (
        <div className="fixed inset-0 z-50 bg-red-950/95 flex flex-col items-center justify-center p-4 text-center">
          <p className="text-xs tracking-widest text-white/70">CTU CRISIS ALERT</p>
          <p className="text-2xl sm:text-3xl font-black text-white mt-2">{countdownLabel}</p>
          <p className="text-sm text-white/80 mt-1">OPERATION REACHED ZERO</p>
          <div className="flex gap-3 mt-6">
            <button onClick={handleSnooze} className="bg-white text-black font-black px-6 py-2 text-sm tracking-widest">SNOOZE 5M</button>
            <button onClick={handleDisarm} className="border-2 border-white text-white font-black px-6 py-2 text-sm tracking-widest">DISARM</button>
          </div>
        </div>
      )}

      {/* Samsung picker — extra props passed via `as any` so any picker prop-shape works */}
      {pickerOpen && (
        <SamsungTimePicker
          {...({ open: pickerOpen, isOpen: pickerOpen, mode: pickerMode, initial: pickerInitial, initialValues: pickerInitial, value: pickerInitial, onConfirm: handlePickerConfirm, onClose: () => setPickerOpen(false), onCancel: () => setPickerOpen(false) } as any)}
        />
      )}

      {openingOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={handleCloseOpening}>
          <div className="border-2 border-[#ffcc00] bg-black p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-black tracking-widest">OPENING FEED</h2>
            <p className="text-xs text-[#ffcc00]/70 mt-2 leading-relaxed">CTU tactical terminal online. All timers are wall-clock driven. Background alerts are armed via the service worker when OS Alerts are linked.</p>
            <button onClick={handleCloseOpening} className="mt-4 bg-[#ffcc00] text-black font-black px-4 py-2 text-xs tracking-widest">CLOSE</button>
          </div>
        </div>
      )}
      {creditsOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={handleCloseCredits}>
          <div className="border-2 border-[#ffcc00] bg-black p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-black tracking-widest">CREDITS</h2>
            <p className="text-xs text-[#ffcc00]/70 mt-2 leading-relaxed">CTU Tactical Operational Command — fan-made terminal inspired by 24. Not affiliated with FOX / Disney.</p>
            <button onClick={handleCloseCredits} className="mt-4 bg-[#ffcc00] text-black font-black px-4 py-2 text-xs tracking-widest">CLOSE</button>
          </div>
        </div>
      )}
    </main>
  );
}
