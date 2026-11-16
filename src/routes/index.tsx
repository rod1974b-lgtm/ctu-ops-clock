// src/routes/index.tsx — FULL REPLACEMENT FILE
// CTU Tactical Operational Command (24 Theme v75)
// Fixes:
//  1) Decoupled mount registration effect from timers state (eliminates "Maximum update depth exceeded").
//  2) Dedicated Screen Wake Lock effect that tracks running state without cycle triggers.
//  3) Stable master 1-second heartbeat interval using refs for tick reconciliation.
//  4) Pure state reducers with side-effects executed cleanly outside state updaters.

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SamsungTimePicker, type SamsungTimePickerValues } from "@/components/samsung-time-picker";
import { CTUAudio } from "@/lib/ctu-audio";
import { nextAlarm } from "@/lib/mission-engine";

export const Route = createFileRoute("/")({
  component: CTUTerminalV75,
  head: () => ({
    title: "CTU Tactical Operational Command | 24 v75",
    meta: [
      { name: "description", content: "24-style CTU operational command terminal with multi-alarm and live wake lock." },
      { property: "og:title", content: "CTU Tactical Operational Command" },
      { property: "og:description", content: "Obsidian & amber real-time mission timer terminal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type ZeroSoundType = "voice" | "boom" | "silent";

interface OperationalTimer {
  id: string;
  label: string;
  durationSec: number;
  remainingSec: number;
  running: boolean;
  timesUp: boolean;
  status: "STANDBY" | "ACTIVE" | "HOLD" | "EXPIRED";
}

interface OperationalAlarm {
  id: string;
  label: string;
  hour: number;
  minute: number;
  days: number[];
  armed: boolean;
}

interface StoredDeadline {
  id: string;
  label: string;
  targetEpochMs: number;
  type: "timer" | "alarm";
  days?: number[];
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

// ---------- Background alert helpers (inlined for self-contained execution) ----------
const DEADLINES_KEY = "ctu_active_deadlines";

function loadDeadlines(): StoredDeadline[] {
  try {
    const p = JSON.parse(localStorage.getItem(DEADLINES_KEY) || "[]");
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

function saveDeadlines(list: StoredDeadline[]) {
  try {
    localStorage.setItem(DEADLINES_KEY, JSON.stringify(list));
  } catch {}
}

function upsertDeadline(d: StoredDeadline) {
  saveDeadlines([...loadDeadlines().filter((x) => x.id !== d.id), d]);
}

function removeDeadline(id: string) {
  saveDeadlines(loadDeadlines().filter((x) => x.id !== id));
}

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

async function scheduleBackgroundAlert(input: {
  id: string;
  label: string;
  title: string;
  body: string;
  targetEpochMs: number;
  type: "timer" | "alarm";
  days?: number[];
}) {
  upsertDeadline({ id: input.id, label: input.label, targetEpochMs: input.targetEpochMs, type: input.type, days: input.days });
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

async function cancelBackgroundAlert(id: string) {
  removeDeadline(id);
  await postToWorker({ type: "CANCEL_ALERT", id });
}

async function rescheduleAllDeadlines(onMissed?: (d: StoredDeadline) => void) {
  const now = Date.now();
  for (const d of loadDeadlines()) {
    if (d.targetEpochMs <= now) {
      removeDeadline(d.id);
      onMissed?.(d);
    } else {
      await postToWorker({
        type: "SCHEDULE_ALERT",
        id: d.id,
        label: d.label,
        title: d.type === "alarm" ? `[CTU ALARM DISPATCH] ${d.label.toUpperCase()}` : `[CTU CRISIS ALERT] ${d.label.toUpperCase()} AT ZERO`,
        body: d.type === "alarm" ? "Scheduled tactical alarm." : "Operation reached zero.",
        targetEpochMs: d.targetEpochMs,
      });
    }
  }
  await postToWorker({ type: "CHECK_MISSED" });
}
// -------------------------------------------------------------------------------------

function CTUTerminalV75() {
  const [mounted, setMounted] = useState(false);
  const [nowDate, setNowDate] = useState<Date>(() => new Date());
  const [colonVisible, setColonVisible] = useState(true);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [masterVol, setMasterVol] = useState(85);
  const [zeroSound, setZeroSound] = useState<ZeroSoundType>("voice");

  const [timers, setTimers] = useState<OperationalTimer[]>(() => {
    if (typeof window === "undefined") return INITIAL_TIMERS;
    try {
      const s = localStorage.getItem("ctu_timers_v74");
      return s ? JSON.parse(s) : INITIAL_TIMERS;
    } catch {
      return INITIAL_TIMERS;
    }
  });

  const [alarms, setAlarms] = useState<OperationalAlarm[]>(() => {
    if (typeof window === "undefined") return INITIAL_ALARMS;
    try {
      const s = localStorage.getItem("ctu_alarms_v74");
      return s ? JSON.parse(s) : INITIAL_ALARMS;
    } catch {
      return INITIAL_ALARMS;
    }
  });

  const [activeTimerId, setActiveTimerId] = useState<string>("timer-alpha");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<"timer" | "alarm">("timer");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [pickerInitial, setPickerInitial] = useState<SamsungTimePickerValues>({
    hours: 0,
    minutes: 25,
    seconds: 0,
    days: [0, 1, 2, 3, 4, 5, 6],
    totalSeconds: 25 * 60,
  });

  const [countdownTakeover, setCountdownTakeover] = useState(false);
  const [countdownRemaining, setCountdownRemaining] = useState(10);
  const [countdownLabel, setCountdownLabel] = useState("");
  const [crisisOverlay, setCrisisOverlay] = useState(false);
  const [openingOpen, setOpeningOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [osAlertStatus, setOsAlertStatus] = useState<NotificationPermission>("default");

  // Tactical Screen Wake Lock State
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [manualWakeLockOverride, setManualWakeLockOverride] = useState<boolean | null>(null);
  const wakeLockRef = useRef<any>(null);

  const lastAlarmTriggerRef = useRef<Record<string, string>>({});
  const lastCountdownSecondRef = useRef<number | null>(null);
  const timerDeadlinesRef = useRef<Map<string, number>>(new Map());
  const zeroSoundRef = useRef(zeroSound);
  zeroSoundRef.current = zeroSound;

  // Stable references for timer interval loop
  const timersRef = useRef(timers);
  timersRef.current = timers;
  const alarmsRef = useRef(alarms);
  alarmsRef.current = alarms;
  const activeTimerIdRef = useRef(activeTimerId);
  activeTimerIdRef.current = activeTimerId;
  const countdownTakeoverRef = useRef(countdownTakeover);
  countdownTakeoverRef.current = countdownTakeover;

  const unlockAudio = useCallback(() => {
    if (!audioUnlocked) {
      CTUAudio.unlock();
      setAudioUnlocked(true);
    }
  }, [audioUnlocked]);

  const requestWakeLock = useCallback(async () => {
    if (typeof window === "undefined" || !("wakeLock" in navigator)) return;
    try {
      if (!wakeLockRef.current) {
        const sentinel = await (navigator as any).wakeLock.request("screen");
        sentinel.addEventListener("release", () => {
          wakeLockRef.current = null;
          setWakeLockActive(false);
        });
        wakeLockRef.current = sentinel;
        setWakeLockActive(true);
      }
    } catch {}
  }, []);

  const releaseWakeLock = useCallback(async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        setWakeLockActive(false);
      }
    } catch {}
  }, []);

  // 1. One-time client mount effect: registers worker and catches up on deadlines
  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined" && "Notification" in window) {
      setOsAlertStatus(Notification.permission);
    }

    void registerCTUWorker().then(() => {
      const deadlines = loadDeadlines();
      setTimers((prev) =>
        prev.map((t) => {
          if (!t.running) return t;
          const d = deadlines.find((x) => x.id === t.id && x.type === "timer");
          if (!d) return { ...t, running: false, status: "HOLD" };
          const remaining = Math.ceil((d.targetEpochMs - Date.now()) / 1000);
          if (remaining <= 0) {
            return { ...t, remainingSec: 0, running: false, timesUp: true, status: "EXPIRED" };
          }
          timerDeadlinesRef.current.set(t.id, d.targetEpochMs);
          return { ...t, remainingSec: remaining };
        })
      );

      void rescheduleAllDeadlines((missed) => {
        if (missed.type === "timer") {
          setTimers((prev) =>
            prev.map((t) =>
              t.id === missed.id ? { ...t, remainingSec: 0, running: false, timesUp: true, status: "EXPIRED" } : t
            )
          );
        }
        setCountdownLabel(missed.label);
        setCrisisOverlay(true);
        CTUAudio.triggerZeroSound(zeroSoundRef.current);
      });
    });
  }, []);

  // 2. Dedicated Screen Wake Lock effect: tracks running status without re-running on every second
  const isAnyTimerRunning = useMemo(() => timers.some((t) => t.running), [timers]);

  useEffect(() => {
    if (isAnyTimerRunning || manualWakeLockOverride) {
      void requestWakeLock();
    } else {
      void releaseWakeLock();
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        if (isAnyTimerRunning || manualWakeLockOverride) {
          void requestWakeLock();
        }
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isAnyTimerRunning, manualWakeLockOverride, requestWakeLock, releaseWakeLock]);

  // 3. Persist timers & alarms to localStorage
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem("ctu_timers_v74", JSON.stringify(timers));
    } catch {}
  }, [timers, mounted]);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem("ctu_alarms_v74", JSON.stringify(alarms));
    } catch {}
  }, [alarms, mounted]);

  const scheduleTimerBackground = useCallback(
    (timer: OperationalTimer, targetEpochMs?: number) => {
      if (osAlertStatus !== "granted") return;
      const target = targetEpochMs ?? Date.now() + timer.remainingSec * 1000;
      void scheduleBackgroundAlert({
        id: timer.id,
        label: timer.label,
        type: "timer",
        targetEpochMs: target,
        title: `[CTU CRISIS ALERT] ${timer.label.toUpperCase()} AT ZERO`,
        body: `Operation reached zero. Return to tactical terminal immediately.`,
      });
    },
    [osAlertStatus]
  );

  const cancelTimerBackground = useCallback((id: string) => {
    void cancelBackgroundAlert(id);
  }, []);

  const scheduleAlarmBackground = useCallback(
    (alarm: OperationalAlarm) => {
      if (osAlertStatus !== "granted" || !alarm.armed) return;
      const nextTime = nextAlarm(new Date(), [{ hour: alarm.hour, minute: alarm.minute, days: alarm.days }]);
      if (!nextTime) return;
      void scheduleBackgroundAlert({
        id: alarm.id,
        label: alarm.label,
        type: "alarm",
        days: alarm.days,
        targetEpochMs: nextTime.getTime(),
        title: `[CTU ALARM DISPATCH] ${alarm.label.toUpperCase()}`,
        body: `Scheduled tactical alarm for ${String(alarm.hour).padStart(2, "0")}:${String(alarm.minute).padStart(2, "0")} Bangkok Time.`,
      });
    },
    [osAlertStatus]
  );

  const cancelAlarmBackground = useCallback((id: string) => {
    void cancelBackgroundAlert(id);
  }, []);

  const handleRequestOSAlerts = async () => {
    unlockAudio();
    if (typeof window === "undefined" || !("Notification" in window)) {
      alert("Notification API not supported by this browser.");
      return;
    }
    try {
      const res = await Notification.requestPermission();
      setOsAlertStatus(res);
      if (res === "granted") {
        for (const t of timersRef.current) {
          if (t.running) scheduleTimerBackground(t);
        }
        for (const a of alarmsRef.current) {
          if (a.armed) scheduleAlarmBackground(a);
        }
      }
    } catch {}
  };

  // 4. Stable Master 1-Second Operational Heartbeat (Runs continuously without re-attaching)
  useEffect(() => {
    const tick = setInterval(() => {
      const now = new Date();
      setNowDate(now);
      setColonVisible((p) => !p);

      const expiredTimers: OperationalTimer[] = [];
      let enteredCountdown: { remaining: number; label: string } | null = null;

      // Reconcile wall-clock timer deadlines purely
      setTimers((prev) => {
        let changed = false;
        const next = prev.map((timer) => {
          if (!timer.running) return timer;
          const deadline = timerDeadlinesRef.current.get(timer.id);
          const currentRemaining = deadline
            ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
            : Math.max(0, timer.remainingSec - 1);

          if (currentRemaining !== timer.remainingSec) changed = true;

          if (currentRemaining <= 0) {
            expiredTimers.push(timer);
            return { ...timer, remainingSec: 0, running: false, timesUp: true, status: "EXPIRED" as const };
          }

          if (currentRemaining <= 10 && timer.id === activeTimerIdRef.current && !countdownTakeoverRef.current) {
            enteredCountdown = { remaining: currentRemaining, label: timer.label };
          }

          return { ...timer, remainingSec: currentRemaining };
        });

        return changed ? next : prev;
      });

      // Execute side-effects cleanly outside of the setTimers reducer
      for (const expired of expiredTimers) {
        cancelTimerBackground(expired.id);
        timerDeadlinesRef.current.delete(expired.id);
        setCountdownTakeover(false);
        setCrisisOverlay(true);
        setCountdownLabel(expired.label);
        CTUAudio.triggerZeroSound(zeroSoundRef.current);
      }

      if (enteredCountdown) {
        setCountdownTakeover(true);
        setCountdownRemaining(enteredCountdown.remaining);
        setCountdownLabel(enteredCountdown.label);
      }

      // Synchronize countdown audio
      const currentActive = timersRef.current.find((t) => t.id === activeTimerIdRef.current);
      if (currentActive && currentActive.running && currentActive.remainingSec <= 10 && currentActive.remainingSec > 0) {
        setCountdownRemaining(currentActive.remainingSec);
        if (lastCountdownSecondRef.current !== currentActive.remainingSec) {
          lastCountdownSecondRef.current = currentActive.remainingSec;
          CTUAudio.playCountdownSound(currentActive.remainingSec);
        }
      } else {
        lastCountdownSecondRef.current = null;
      }

      // Check Alarms against Bangkok time (UTC+7)
      const bkkFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Bangkok",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        weekday: "short",
        hour12: false,
      });
      const bkkParts = bkkFormatter.formatToParts(now);
      const bkkHour = parseInt(bkkParts.find((p) => p.type === "hour")?.value || "0", 10);
      const bkkMinute = parseInt(bkkParts.find((p) => p.type === "minute")?.value || "0", 10);
      const bkkSecond = parseInt(bkkParts.find((p) => p.type === "second")?.value || "0", 10);
      const bkkWk = bkkParts.find((p) => p.type === "weekday")?.value || "Sun";
      const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const currentBkkDay = dayMap[bkkWk] ?? 0;

      if (bkkSecond === 0) {
        const timeKey = `${bkkHour}:${bkkMinute}`;
        for (const alarm of alarmsRef.current) {
          if (alarm.armed && alarm.hour === bkkHour && alarm.minute === bkkMinute) {
            if (alarm.days.includes(currentBkkDay) && lastAlarmTriggerRef.current[alarm.id] !== timeKey) {
              lastAlarmTriggerRef.current[alarm.id] = timeKey;
              setCrisisOverlay(true);
              setCountdownLabel(alarm.label);
              CTUAudio.triggerZeroSound(zeroSoundRef.current);
              scheduleAlarmBackground(alarm);
            }
          }
        }
      }
    }, 1000);

    return () => clearInterval(tick);
  }, [cancelTimerBackground, scheduleAlarmBackground]);

  const activeTimer = useMemo(() => {
    return (
      timers.find((t) => t.id === activeTimerId) ||
      timers[0] || {
        id: "timer-fallback",
        label: "TACTICAL TIMER",
        durationSec: 25 * 60,
        remainingSec: 25 * 60,
        running: false,
        timesUp: false,
        status: "STANDBY",
      }
    );
  }, [timers, activeTimerId]);

  const formatDigits = (totalSec: number) => {
    const clamped = Math.max(0, totalSec);
    const h = Math.floor(clamped / 3600);
    const m = Math.floor((clamped % 3600) / 60);
    const s = clamped % 60;
    return {
      h: String(h).padStart(2, "0"),
      m: String(m).padStart(2, "0"),
      s: String(s).padStart(2, "0"),
    };
  };
  const primaryDigits = formatDigits(activeTimer.remainingSec);

  const bangkokTime = useMemo(() => {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Bangkok",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
      year: "numeric",
      month: "short",
      day: "2-digit",
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

  const handleExecuteTimer = (id: string) => {
    unlockAudio();
    const timer = timers.find((t) => t.id === id);
    if (!timer) return;
    const startingSec = timer.remainingSec <= 0 ? (timer.durationSec > 0 ? timer.durationSec : 25 * 60) : timer.remainingSec;
    const deadline = Date.now() + startingSec * 1000;
    timerDeadlinesRef.current.set(id, deadline);
    scheduleTimerBackground(timer, deadline);

    setTimers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, remainingSec: startingSec, running: true, timesUp: false, status: "ACTIVE" } : t))
    );
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
    setTimers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, running: false, timesUp: false, status: "STANDBY", remainingSec: t.durationSec } : t))
    );
  };

  const handleQuickPreset = (seconds: number) => {
    unlockAudio();
    cancelTimerBackground(activeTimer.id);
    timerDeadlinesRef.current.delete(activeTimer.id);
    if (countdownTakeover) setCountdownTakeover(false);
    setTimers((prev) =>
      prev.map((t) =>
        t.id === activeTimerId ? { ...t, durationSec: seconds, remainingSec: seconds, running: false, timesUp: false, status: "STANDBY" } : t
      )
    );
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
    setPickerMode("timer");
    setEditingItemId(null);
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
    setPickerMode("alarm");
    setEditingItemId(alarm.id);
    setPickerInitial({
      hours: alarm.hour,
      minutes: alarm.minute,
      seconds: 0,
      days: alarm.days,
      totalSeconds: alarm.hour * 3600 + alarm.minute * 60,
    });
    setPickerOpen(true);
  };

  const handleAddAlarm = () => {
    unlockAudio();
    setPickerMode("alarm");
    setEditingItemId(null);
    setPickerInitial({ hours: 8, minutes: 0, seconds: 0, days: [1, 2, 3, 4, 5], totalSeconds: 8 * 3600 });
    setPickerOpen(true);
  };

  const handleToggleAlarm = (id: string) => {
    unlockAudio();
    setAlarms((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        const nextState = !a.armed;
        if (nextState) scheduleAlarmBackground({ ...a, armed: true });
        else cancelAlarmBackground(a.id);
        return { ...a, armed: nextState };
      })
    );
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
        setTimers((prev) =>
          prev.map((t) =>
            t.id === editingItemId
              ? { ...t, durationSec: totalSec, remainingSec: totalSec, running: false, timesUp: false, status: "STANDBY" }
              : t
          )
        );
      } else {
        const newTimer: OperationalTimer = {
          id: `timer-${Date.now()}`,
          label: `OPS: ${String(vals.hours).padStart(2, "0")}:${String(vals.minutes).padStart(2, "0")}:${String(vals.seconds).padStart(2, "0")}`,
          durationSec: totalSec,
          remainingSec: totalSec,
          running: false,
          timesUp: false,
          status: "STANDBY",
        };
        setTimers((prev) => [...prev, newTimer]);
        setActiveTimerId(newTimer.id);
      }
    } else {
      const days = vals.days && vals.days.length > 0 ? vals.days : [0, 1, 2, 3, 4, 5, 6];
      if (editingItemId) {
        setAlarms((prev) =>
          prev.map((a) => {
            if (a.id !== editingItemId) return a;
            const updated = { ...a, hour: vals.hours, minute: vals.minutes, days };
            if (updated.armed) scheduleAlarmBackground(updated);
            return updated;
          })
        );
      } else {
        const newAlarm: OperationalAlarm = {
          id: `alarm-${Date.now()}`,
          label: `TACTICAL: ${String(vals.hours).padStart(2, "0")}:${String(vals.minutes).padStart(2, "0")}`,
          hour: vals.hours,
          minute: vals.minutes,
          days,
          armed: true,
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
    CTUAudio.stopCrisisAudio();
  };

  const handleDisarmCrisis = () => {
    unlockAudio();
    setCrisisOverlay(false);
    setCountdownTakeover(false);
    CTUAudio.stopCrisisAudio();
  };

  const handleOpenOpening = () => {
    unlockAudio();
    setOpeningOpen(true);
  };

  const handleCloseOpening = () => {
    setOpeningOpen(false);
  };

  const handleOpenCredits = () => {
    unlockAudio();
    setCreditsOpen(true);
    CTUAudio.playCreditsAudio();
  };

  const handleCloseCredits = () => {
    setCreditsOpen(false);
    CTUAudio.stopCreditsAudio();
  };

  return (
    <main className="min-h-screen bg-black text-[#ffcc00] font-mono p-2 sm:p-4 selection:bg-[#ffcc00] selection:text-black">
      {/* OS Alert Banner (when permission not yet granted) */}
      {osAlertStatus !== "granted" && (
        <div className="border border-[#ffcc00] bg-[#ffcc00]/10 p-2 mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#ffcc00] animate-ping" />
            <span>OS NOTIFICATIONS DISENGAGED — ALERTS WILL NOT SOUND IN BACKGROUND</span>
          </div>
          <button
            onClick={handleRequestOSAlerts}
            className="bg-[#ffcc00] text-black font-black px-3 py-1 hover:bg-[#ffcc00]/80 tracking-wider text-[11px]"
          >
            LINK OS ALERTS
          </button>
        </div>
      )}

      {/* Top Bar Header */}
      <header className="border-2 border-[#ffcc00] bg-black p-3 mb-4 shadow-[0_0_20px_rgba(255,204,0,0.15)] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-[#ffcc00] animate-pulse" />
          <h1 className="text-sm sm:text-base font-black tracking-widest text-[#ffcc00]">
            CTU // TACTICAL OPERATIONS COMMAND
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            onClick={() => {
              if (wakeLockActive) {
                setManualWakeLockOverride(false);
                void releaseWakeLock();
              } else {
                setManualWakeLockOverride(true);
                void requestWakeLock();
              }
            }}
            className={`px-2 py-1 border text-[11px] font-bold tracking-wider transition ${
              wakeLockActive
                ? "border-[#ffcc00] text-black bg-[#ffcc00] shadow-[0_0_10px_rgba(255,204,0,0.5)]"
                : "border-[#ffcc00]/40 text-[#ffcc00]/60 hover:border-[#ffcc00] hover:text-[#ffcc00]"
            }`}
            title="Keep device screen active during operations"
          >
            {wakeLockActive ? "[WAKE LOCK: ENGAGED]" : "[WAKE LOCK: IDLE]"}
          </button>
          <button
            onClick={handleOpenOpening}
            className="px-2 py-1 border border-[#ffcc00]/60 text-[11px] font-bold tracking-wider hover:bg-[#ffcc00] hover:text-black transition"
          >
            OPENING
          </button>
          <button
            onClick={handleOpenCredits}
            className="px-2 py-1 border border-[#ffcc00]/60 text-[11px] font-bold tracking-wider hover:bg-[#ffcc00] hover:text-black transition"
          >
            CREDITS
          </button>
          <button
            onClick={() => {
              unlockAudio();
              setZeroSound((p) => (p === "voice" ? "boom" : p === "boom" ? "silent" : "voice"));
            }}
            className="px-2 py-1 border border-[#ffcc00]/60 text-[11px] font-bold tracking-wider hover:bg-[#ffcc00] hover:text-black transition"
          >
            SOUND: {zeroSound.toUpperCase()}
          </button>
        </div>
      </header>

      {/* World Theaters Marquee Ticker */}
      <div className="border border-[#ffcc00]/40 bg-black p-2 mb-4 overflow-hidden text-xs">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-1.5 h-1.5 bg-[#ffcc00] rounded-full" />
          <span className="text-[10px] tracking-widest text-[#ffcc00]/70 font-bold uppercase">WORLD THEATERS:</span>
        </div>
        <div className="overflow-hidden whitespace-nowrap relative">
          <div className="inline-flex gap-6 animate-world-ticker">
            {[0, 1].map((copy) => (
              <div key={copy} className="inline-flex gap-6">
                {WORLD_THEATERS.map((wt) => {
                  const tStr = new Intl.DateTimeFormat("en-US", {
                    timeZone: wt.tz,
                    hour: "numeric",
                    minute: "numeric",
                    second: "numeric",
                    hour12: false,
                  }).format(nowDate);
                  return (
                    <span key={`${copy}-${wt.city}`} className="inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                      <span className="text-[#ffcc00]/50">{wt.city}:</span>
                      <strong className="text-[#ffcc00] font-mono">{tStr}</strong>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Active Theater Bangkok Clock */}
        <section className="border-2 border-[#ffcc00] bg-black p-3 sm:p-4 flex flex-col justify-between shadow-[0_0_25px_rgba(255,204,0,0.2)]">
          <div className="flex items-center justify-between border-b border-[#ffcc00]/40 pb-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#ffcc00] animate-ping" />
              <span className="text-xs font-black tracking-widest text-[#ffcc00]">ACTIVE THEATER: BANGKOK HQ (UTC+7)</span>
            </div>
            <span className="text-[11px] text-[#ffcc00]/70 tabular-nums">
              ZULU: <strong className="text-[#ffcc00]">{zuluTime}</strong>
            </span>
          </div>
          <div className="flex flex-col items-center justify-center my-3 sm:my-4 py-1">
            <div className="text-3xl sm:text-4xl md:text-5xl font-black text-[#ffcc00] tracking-tight tabular-nums text-center">
              {bangkokTime.time.split(":").map((part, idx, arr) => (
                <span key={idx}>
                  {part}
                  {idx < arr.length - 1 && (
                    <span className={colonVisible ? "opacity-100 text-[#ffcc00]" : "opacity-20 text-[#ffcc00]/40"}>:</span>
                  )}
                </span>
              ))}
            </div>
            <div className="mt-1.5 text-xs tracking-widest text-[#ffcc00]/70 font-bold">{bangkokTime.date}</div>
          </div>
          <div className="border-t border-[#ffcc00]/30 pt-2 flex items-center justify-between text-[11px] text-[#ffcc00]/60">
            <span>SYNCHRONIZED WITH CTU SATELLITE NETWORK</span>
            <span className="text-[#ffcc00] font-bold">SIGNAL LOCK: 100%</span>
          </div>
        </section>

        {/* Primary Operational Countdown */}
        <section className="border-2 border-[#ffcc00] bg-black p-3 sm:p-4 flex flex-col justify-between shadow-[0_0_25px_rgba(255,204,0,0.2)]">
          <div className="flex items-center justify-between border-b border-[#ffcc00]/40 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black tracking-widest text-[#ffcc00]">{activeTimer.label}</span>
            </div>
            <span
              className={`text-[10px] font-bold tracking-widest px-2 py-0.5 border ${
                activeTimer.running
                  ? "border-[#ffcc00] text-[#ffcc00] bg-[#ffcc00]/10"
                  : activeTimer.timesUp
                  ? "border-red-600 text-red-500 bg-red-950/20"
                  : "border-[#ffcc00]/40 text-[#ffcc00]/60"
              }`}
            >
              {activeTimer.status}
            </span>
          </div>
          <div
            onClick={() => handleEditTimer(activeTimer)}
            className="flex flex-col items-center justify-center my-3 sm:my-4 py-1 cursor-pointer group"
            title="Tap to adjust operational duration"
          >
            <div className="text-3xl sm:text-4xl md:text-5xl font-black text-[#ffcc00] tracking-tight tabular-nums group-hover:scale-[1.02] transition-transform text-center">
              {primaryDigits.h}:{primaryDigits.m}:{primaryDigits.s}
            </div>
            <div className="mt-1.5 text-[10px] tracking-widest text-[#ffcc00]/60 group-hover:text-[#ffcc00] transition">
              TAP DIGITS TO MODIFY TIME (SAMSUNG HH:MM:SS)
            </div>
          </div>
          <div className="border-t border-[#ffcc00]/30 pt-3 flex items-center justify-center gap-2 sm:gap-4">
            {!activeTimer.running ? (
              <button
                onClick={() => handleExecuteTimer(activeTimer.id)}
                className="bg-[#ffcc00] text-black font-black text-xs sm:text-sm tracking-widest py-2 px-6 hover:bg-[#ffcc00]/80 active:scale-95 transition shadow-[0_0_15px_rgba(255,204,0,0.4)]"
              >
                EXECUTE
              </button>
            ) : (
              <button
                onClick={() => handlePauseTimer(activeTimer.id)}
                className="bg-black border-2 border-[#ffcc00] text-[#ffcc00] font-black text-xs sm:text-sm tracking-widest py-2 px-6 hover:bg-[#ffcc00]/20 active:scale-95 transition"
              >
                HOLD
              </button>
            )}
            <button
              onClick={() => handleResetTimer(activeTimer.id)}
              className="border border-[#ffcc00]/50 text-[#ffcc00]/80 font-bold text-xs sm:text-sm tracking-widest py-2 px-4 hover:border-[#ffcc00] hover:text-[#ffcc00] active:scale-95 transition"
            >
              RESET
            </button>
          </div>
        </section>
      </div>

      {/* Quick Tactical Presets */}
      <div className="border border-[#ffcc00]/40 bg-black p-3 mb-4 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold tracking-wider text-[#ffcc00]/70">QUICK ARMED PRESETS:</span>
        <div className="flex flex-wrap gap-2">
          {QUICK_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => handleQuickPreset(preset.seconds)}
              className="px-3 py-1 border border-[#ffcc00]/60 text-xs font-bold hover:bg-[#ffcc00] hover:text-black transition"
            >
              {preset.label} ({preset.seconds / 60}M)
            </button>
          ))}
          <button
            onClick={handleAddTimer}
            className="px-3 py-1 bg-[#ffcc00] text-black text-xs font-black hover:bg-[#ffcc00]/80 transition"
          >
            + NEW TIMER
          </button>
        </div>
      </div>

      {/* Lists of Timers & Alarms */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <section className="border border-[#ffcc00]/50 bg-black p-3">
          <h2 className="text-xs font-black tracking-widest text-[#ffcc00] border-b border-[#ffcc00]/40 pb-2 mb-2">
            OPERATIONAL TIMERS
          </h2>
          <div className="space-y-2">
            {timers.map((t) => {
              const d = formatDigits(t.remainingSec);
              const isActive = t.id === activeTimerId;
              return (
                <div
                  key={t.id}
                  onClick={() => setActiveTimerId(t.id)}
                  className={`border p-2 cursor-pointer transition ${
                    isActive ? "border-[#ffcc00] bg-[#ffcc00]/10" : "border-[#ffcc00]/30 hover:border-[#ffcc00]/70"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold tracking-wider truncate">{t.label}</span>
                    <span className="text-sm font-black tabular-nums shrink-0">
                      {d.h}:{d.m}:{d.s}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-[#ffcc00]/60">{t.status}</span>
                    <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      {!t.running ? (
                        <button
                          onClick={() => handleExecuteTimer(t.id)}
                          className="px-2 py-0.5 border border-[#ffcc00]/60 text-[10px] font-bold hover:bg-[#ffcc00] hover:text-black"
                        >
                          EXECUTE
                        </button>
                      ) : (
                        <button
                          onClick={() => handlePauseTimer(t.id)}
                          className="px-2 py-0.5 border border-[#ffcc00]/60 text-[10px] font-bold hover:bg-[#ffcc00] hover:text-black"
                        >
                          HOLD
                        </button>
                      )}
                      <button
                        onClick={() => handleEditTimer(t)}
                        className="px-2 py-0.5 border border-[#ffcc00]/60 text-[10px] font-bold hover:bg-[#ffcc00] hover:text-black"
                      >
                        EDIT
                      </button>
                      <button
                        onClick={() => handleDeleteTimer(t.id)}
                        className="px-2 py-0.5 border border-red-600/60 text-red-400 text-[10px] font-bold hover:bg-red-600 hover:text-white"
                      >
                        DEL
                      </button>
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
            <button
              onClick={handleAddAlarm}
              className="bg-[#ffcc00] text-black px-2 py-0.5 text-[11px] font-black tracking-wider hover:bg-[#ffcc00]/80"
            >
              + NEW ALARM
            </button>
          </div>
          <div className="space-y-2">
            {alarms.length === 0 && <p className="text-[11px] text-[#ffcc00]/60">NO ALARMS ARMED.</p>}
            {alarms.map((a) => (
              <div key={a.id} className="border border-[#ffcc00]/30 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold tracking-wider truncate">{a.label}</span>
                  <span className="text-sm font-black tabular-nums shrink-0">
                    {String(a.hour).padStart(2, "0")}:{String(a.minute).padStart(2, "0")}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-[#ffcc00]/60">
                    {a.days.map((d) => ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][d]).join(" ")}
                  </span>
                  <span className="flex gap-1">
                    <button
                      onClick={() => handleToggleAlarm(a.id)}
                      className={`px-2 py-0.5 border text-[10px] font-bold ${
                        a.armed ? "border-[#ffcc00] bg-[#ffcc00] text-black" : "border-[#ffcc00]/60 text-[#ffcc00]"
                      }`}
                    >
                      {a.armed ? "ARMED" : "OFF"}
                    </button>
                    <button
                      onClick={() => handleEditAlarm(a)}
                      className="px-2 py-0.5 border border-[#ffcc00]/60 text-[10px] font-bold hover:bg-[#ffcc00] hover:text-black"
                    >
                      EDIT
                    </button>
                    <button
                      onClick={() => handleDeleteAlarm(a.id)}
                      className="px-2 py-0.5 border border-red-600/60 text-red-400 text-[10px] font-bold hover:bg-red-600 hover:text-white"
                    >
                      DEL
                    </button>
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-[#ffcc00]/30 mt-3 pt-3 space-y-2">
            <div className="text-[11px] text-[#ffcc00]/80 font-bold uppercase tracking-wider">
              OPERATIONAL MASTER VOLUME
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0"
                max="100"
                value={masterVol}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setMasterVol(v);
                  CTUAudio.setMasterVolume(v / 100);
                }}
                className="w-full accent-[#ffcc00] cursor-pointer"
              />
              <span className="text-xs font-black tabular-nums">{masterVol}%</span>
            </div>
          </div>
        </section>
      </div>

      {/* 10-Second Countdown Takeover */}
      {countdownTakeover && (
        <div className="fixed inset-0 z-40 bg-black/95 flex flex-col items-center justify-center p-4 border-4 border-red-600 animate-pulse">
          <div className="text-xs sm:text-sm font-black text-red-500 tracking-[0.3em] uppercase">
            TACTICAL CRISIS IMMINENT // {countdownLabel}
          </div>
          <div className="text-8xl sm:text-9xl font-black text-red-600 tracking-tighter tabular-nums mt-2 drop-shadow-[0_0_40px_rgba(255,0,0,0.8)]">
            {countdownRemaining}
          </div>
          <div className="text-xs text-red-400/80 tracking-widest mt-2">SECONDS TO DEADLINE ZERO</div>
          <button
            onClick={handleDisarmCrisis}
            className="mt-6 border-2 border-red-600 text-red-500 hover:bg-red-600 hover:text-black font-black px-6 py-2 text-xs tracking-widest transition"
          >
            DISARM COUNTDOWN
          </button>
        </div>
      )}

      {/* Crisis Overlay at Zero */}
      {crisisOverlay && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4 border-4 border-red-600">
          <div className="text-sm font-black text-red-500 tracking-widest uppercase">
            [CRISIS ALERT] // {countdownLabel}
          </div>
          <div className="text-6xl sm:text-7xl md:text-8xl font-black text-red-600 my-4 tracking-tight tabular-nums drop-shadow-[0_0_50px_rgba(255,0,0,0.9)] text-center">
            00:00:00
          </div>
          <div className="text-xs text-red-400 tracking-widest mb-6">TARGET DEADLINE HAS BEEN REACHED</div>
          <div className="flex gap-4">
            <button
              onClick={handleSnooze}
              className="bg-[#ffcc00] text-black font-black px-6 py-2 text-xs tracking-widest hover:bg-[#ffcc00]/80 transition"
            >
              SNOOZE (5M)
            </button>
            <button
              onClick={handleDisarmCrisis}
              className="border-2 border-red-600 text-red-500 hover:bg-red-600 hover:text-black font-black px-6 py-2 text-xs tracking-widest transition"
            >
              DISARM TERMINAL
            </button>
          </div>
        </div>
      )}

      {/* Samsung HH:MM:SS Picker */}
      {pickerOpen && (
        <SamsungTimePicker
          key={`${pickerMode}-${editingItemId ?? "new"}`}
          isOpen={pickerOpen}
          mode={pickerMode}
          initialValues={pickerInitial}
          initialFocus="minutes"
          onConfirm={handlePickerConfirm}
          onCancel={() => setPickerOpen(false)}
        />
      )}

      {/* Opening Feed Modal */}
      {openingOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={handleCloseOpening}>
          <div className="border-2 border-[#ffcc00] bg-black p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-black tracking-widest">OPENING FEED</h2>
            <p className="text-xs text-[#ffcc00]/70 mt-2 leading-relaxed">
              CTU tactical terminal online. All timers are wall-clock driven. Screen Wake Lock keeps the terminal display active during operations.
            </p>
            <button onClick={handleCloseOpening} className="mt-4 bg-[#ffcc00] text-black font-black px-4 py-2 text-xs tracking-widest hover:bg-[#ffcc00]/80">
              ACKNOWLEDGE
            </button>
          </div>
        </div>
      )}

      {/* Ending Credits Modal */}
      {creditsOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={handleCloseCredits}>
          <div className="border-2 border-[#ffcc00] bg-black p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-black tracking-widest">MISSION CREDITS</h2>
            <p className="text-xs text-[#ffcc00]/70 mt-2 leading-relaxed">
              24-inspired CTU Operational Command Terminal. Built with React, Tailwind, and Web Audio. Not affiliated with FOX / Disney.
            </p>
            <button onClick={handleCloseCredits} className="mt-4 bg-[#ffcc00] text-black font-black px-4 py-2 text-xs tracking-widest hover:bg-[#ffcc00]/80">
              CLOSE
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
