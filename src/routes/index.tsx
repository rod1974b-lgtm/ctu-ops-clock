// src/routes/index.tsx — FULL REPLACEMENT FILE
// CTU Tactical Operational Command (24 Theme v76)
// Fixes:
//  1) Eliminates SSR hydration mismatch by suppressing hydration warnings on live wall clocks.
//  2) Fixes timer setting: allows exact 00 minutes/seconds without 25-minute fallback coercion.
//  3) Fixes EXECUTE action: begins countdown immediately on wall-clock delta without worker race conditions.
//  4) Decoupled mount registration effect from timers state to eliminate update loops.
//  5) Dedicated Screen Wake Lock tracking.

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SamsungTimePicker, type SamsungTimePickerValues } from "@/components/samsung-time-picker";
import { CTUAudio } from "@/lib/ctu-audio";
import {
  registerCTUWorker,
  scheduleBackgroundAlert,
  cancelBackgroundAlert,
  updateLockscreenHUD,
  loadDeadlines,
  rescheduleAllDeadlines,
} from "@/lib/background-alerts";

export const Route = createFileRoute("/")({
  component: CTUTerminalV76,
  head: () => ({
    title: "CTU Tactical Operational Command | 24 v76",
    meta: [
      { name: "description", content: "24-style CTU operational command terminal with multi-alarm and live wake lock." },
      { property: "og:title", content: "CTU Tactical Operational Command" },
      { property: "og:description", content: "Obsidian & amber real-time mission timer terminal." },
    ],
  }),
});

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
  { code: "BKK", name: "BANGKOK (HQ)", tz: "Asia/Bangkok" },
  { code: "ZULU", name: "UTC PRIME", tz: "UTC" },
  { code: "WAS", name: "WASHINGTON DC", tz: "America/New_York" },
  { code: "LAX", name: "LOS ANGELES CTU", tz: "America/Los_Angeles" },
  { code: "LON", name: "LONDON MI6", tz: "Europe/London" },
  { code: "TYO", name: "TOKYO METRO", tz: "Asia/Tokyo" },
];

function CTUTerminalV76() {
  const [mounted, setMounted] = useState(false);
  const [nowDate, setNowDate] = useState(() => new Date());
  const [colonVisible, setColonVisible] = useState(true);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [masterVol, setMasterVol] = useState(85);
  const [osAlertStatus, setOsAlertStatus] = useState<NotificationPermission>("default");
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [manualWakeLockOverride, setManualWakeLockOverride] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const [timers, setTimers] = useState<OperationalTimer[]>(() => {
    if (typeof window === "undefined") return INITIAL_TIMERS;
    try {
      const s = localStorage.getItem("ctu_timers_v76");
      return s ? JSON.parse(s) : INITIAL_TIMERS;
    } catch {
      return INITIAL_TIMERS;
    }
  });

  const [alarms, setAlarms] = useState<OperationalAlarm[]>(() => {
    if (typeof window === "undefined") return INITIAL_ALARMS;
    try {
      const s = localStorage.getItem("ctu_alarms_v76");
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
  const [zeroSound, setZeroSound] = useState<"voice" | "boom" | "alarm" | "ctu_beep" | "stinger">("voice");
  const [openingOpen, setOpeningOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);

  const timersRef = useRef(timers);
  timersRef.current = timers;
  const alarmsRef = useRef(alarms);
  alarmsRef.current = alarms;
  const activeTimerIdRef = useRef(activeTimerId);
  activeTimerIdRef.current = activeTimerId;
  const countdownTakeoverRef = useRef(countdownTakeover);
  countdownTakeoverRef.current = countdownTakeover;
  const timerDeadlinesRef = useRef<Map<string, number>>(new Map());
  const zeroSoundRef = useRef(zeroSound);
  zeroSoundRef.current = zeroSound;
  const lastCountdownSecondRef = useRef<number | null>(null);
  const lastAlarmTriggerRef = useRef<Record<string, string>>({});

  const unlockAudio = useCallback(() => {
    if (!audioUnlocked) {
      CTUAudio.unlock();
      setAudioUnlocked(true);
    }
  }, [audioUnlocked]);

  const requestWakeLock = useCallback(async () => {
    if (typeof navigator !== "undefined" && "wakeLock" in navigator && !wakeLockRef.current) {
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        wakeLockRef.current = sentinel;
        setWakeLockActive(true);
        sentinel.addEventListener("release", () => {
          wakeLockRef.current = null;
          setWakeLockActive(false);
        });
      } catch {
        setWakeLockActive(false);
      }
    }
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

  // 1. Client mount effect
  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined" && "Notification" in window) {
      setOsAlertStatus(Notification.permission);
    }

    void registerCTUWorker().then(() => {
      const deadlines = loadDeadlines();
      if (deadlines.length > 0) {
        setTimers((prev) =>
          prev.map((t) => {
            if (!t.running) return t;
            const d = deadlines.find((x) => x.id === t.id && x.type === "timer");
            if (!d) return t;
            const remaining = Math.ceil((d.targetEpochMs - Date.now()) / 1000);
            if (remaining <= 0) {
              return { ...t, remainingSec: 0, running: false, timesUp: true, status: "EXPIRED" };
            }
            timerDeadlinesRef.current.set(t.id, d.targetEpochMs);
            return { ...t, remainingSec: remaining };
          })
        );
      }

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

  // 2. Screen Wake Lock effect
  const isAnyTimerRunning = useMemo(() => timers.some((t) => t.running), [timers]);

  useEffect(() => {
    if (isAnyTimerRunning || manualWakeLockOverride) {
      void requestWakeLock();
    } else {
      void releaseWakeLock();
    }
  }, [isAnyTimerRunning, manualWakeLockOverride, requestWakeLock, releaseWakeLock]);

  // 3. LocalStorage persistence
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem("ctu_timers_v76", JSON.stringify(timers));
    } catch {}
  }, [timers, mounted]);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem("ctu_alarms_v76", JSON.stringify(alarms));
    } catch {}
  }, [alarms, mounted]);

  const scheduleTimerBackground = useCallback(
    (timer: OperationalTimer, targetEpochMs?: number) => {
      const target = targetEpochMs ?? Date.now() + timer.remainingSec * 1000;
      void scheduleBackgroundAlert({
        id: timer.id,
        label: timer.label,
        type: "timer",
        targetEpochMs: target,
        title: `[CTU CRISIS ALERT] ${timer.label.toUpperCase()} AT ZERO`,
        body: `Operation deadline reached. Tap to open terminal and respond.`,
      });
    },
    []
  );

  const cancelTimerBackground = useCallback((id: string) => {
    void cancelBackgroundAlert(id);
  }, []);

  const scheduleAlarmBackground = useCallback((alarm: OperationalAlarm) => {
    const now = new Date();
    const bkkFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Bangkok",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
    });
    const parts = bkkFormatter.formatToParts(now);
    const bkkH = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
    const bkkM = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);

    let diffMinutes = (alarm.hour - bkkH) * 60 + (alarm.minute - bkkM);
    if (diffMinutes <= 0) diffMinutes += 24 * 60;
    const targetEpoch = Date.now() + diffMinutes * 60 * 1000;

    void scheduleBackgroundAlert({
      id: alarm.id,
      label: alarm.label,
      type: "alarm",
      targetEpochMs: targetEpoch,
      days: alarm.days,
      title: `[CTU ALARM ACTIVE] ${alarm.label.toUpperCase()}`,
      body: `Operational schedule reached for Bangkok time ${String(alarm.hour).padStart(2, "0")}:${String(alarm.minute).padStart(2, "0")}.`,
    });
  }, []);

  const cancelAlarmBackground = useCallback((id: string) => {
    void cancelBackgroundAlert(id);
  }, []);

  const handleRequestOsAlerts = async () => {
    unlockAudio();
    if (typeof window === "undefined" || !("Notification" in window)) return;
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

  // 4. Operational Heartbeat Interval
  useEffect(() => {
    const tick = setInterval(() => {
      const now = new Date();
      setNowDate(now);
      setColonVisible((p) => !p);

      const expiredTimers: OperationalTimer[] = [];
      let enteredCountdown: { remaining: number; label: string } | null = null;

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
    const startingSec = timer.remainingSec <= 0 ? timer.durationSec : timer.remainingSec;
    if (startingSec <= 0) return;
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
          label: `TIMER ${timers.length + 1}`,
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
    CTUAudio.startCreditsAudio();
  };

  const handleCloseCredits = () => {
    setCreditsOpen(false);
    CTUAudio.stopCreditsAudio();
  };

  return (
    <main className="min-h-screen bg-black text-[#ffcc00] font-mono select-none flex flex-col p-2 sm:p-4 max-w-7xl mx-auto">
      {/* Tactical Top Bar */}
      <header className="border border-[#ffcc00]/40 bg-black p-2 sm:p-3 mb-3 flex flex-wrap items-center justify-between gap-2 shadow-[0_0_15px_rgba(255,204,0,0.15)]">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 bg-[#ffcc00] animate-pulse" />
          <h1 className="text-sm sm:text-base font-black tracking-widest text-[#ffcc00]">
            CTU // OPERATIONS TERMINAL
          </h1>
          <span className="text-[10px] text-[#ffcc00]/70 border border-[#ffcc00]/40 px-1.5 py-0.5">
            24 OPS v76
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 text-xs">
          <button
            onClick={() => setManualWakeLockOverride((p) => !p)}
            className={`px-2 py-0.5 border text-[11px] font-bold tracking-wider transition ${
              wakeLockActive
                ? "border-[#ffcc00] bg-[#ffcc00] text-black shadow-[0_0_10px_rgba(255,204,0,0.4)]"
                : "border-[#ffcc00]/40 text-[#ffcc00]/60 hover:text-[#ffcc00]"
            }`}
            title="Toggle display wake lock manually"
          >
            [WAKE LOCK: {wakeLockActive ? "ENGAGED" : "IDLE"}]
          </button>

          <button
            onClick={handleRequestOsAlerts}
            className={`px-2 py-0.5 border text-[11px] font-bold tracking-wider transition ${
              osAlertStatus === "granted"
                ? "border-emerald-500 text-emerald-400"
                : "border-[#ffcc00] bg-[#ffcc00]/10 text-[#ffcc00] animate-pulse"
            }`}
          >
            {osAlertStatus === "granted" ? "● OS ALERTS LINKED" : "○ LINK OS ALERTS"}
          </button>

          <button
            onClick={handleOpenOpening}
            className="px-2 py-0.5 border border-[#ffcc00]/40 text-[11px] font-bold hover:bg-[#ffcc00] hover:text-black transition"
          >
            OPENING FEED
          </button>

          <button
            onClick={handleOpenCredits}
            className="px-2 py-0.5 border border-[#ffcc00]/40 text-[11px] font-bold hover:bg-[#ffcc00] hover:text-black transition"
          >
            CREDITS
          </button>
        </div>
      </header>

      {/* World Theaters Ribbon */}
      <div className="border border-[#ffcc00]/30 bg-[#050505] p-2 mb-3 overflow-hidden text-xs">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[10px] font-black tracking-widest text-[#ffcc00]/80 shrink-0">
            THEATER RADAR:
          </span>
          <div className="overflow-hidden relative w-full">
            <div className="inline-flex gap-6 whitespace-nowrap animate-[marquee_25s_linear_infinite]">
              {WORLD_THEATERS.map((t) => {
                const formatter = new Intl.DateTimeFormat("en-US", {
                  timeZone: t.tz,
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: false,
                });
                const formatted = formatter.format(nowDate);
                return (
                  <span key={t.code} className="inline-flex items-center gap-1.5 text-[11px]" suppressHydrationWarning>
                    <span className="text-[#ffcc00]/60 font-bold">{t.code}</span>
                    <strong className="text-[#ffcc00] font-mono">{formatted}</strong>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Primary Clocks & Active Timer HUD */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        {/* Mission Clocks Panel */}
        <section className="border-2 border-[#ffcc00] bg-black p-3 sm:p-4 shadow-[0_0_20px_rgba(255,204,0,0.2)] flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-[#ffcc00]/40 pb-2 mb-2">
            <span className="text-xs font-black tracking-widest text-[#ffcc00]">LOCAL MISSION TIME (BANGKOK)</span>
            <span className="text-[11px] text-[#ffcc00]/70 font-mono tracking-wider">UTC+7 // FIELD HQ</span>
          </div>

          <div className="my-2 sm:my-4 flex flex-col items-center justify-center">
            <div className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-[#ffcc00] drop-shadow-[0_0_15px_rgba(255,204,0,0.6)] tabular-nums" suppressHydrationWarning>
              {bangkokTime.time.split(":")[0]}
              <span className={colonVisible ? "opacity-100" : "opacity-20"}>:</span>
              {bangkokTime.time.split(":")[1]}
              <span className={colonVisible ? "opacity-100" : "opacity-20"}>:</span>
              {bangkokTime.time.split(":")[2]}
            </div>
            <div className="mt-1 text-xs text-[#ffcc00]/80 tracking-widest font-bold" suppressHydrationWarning>
              {bangkokTime.date}
            </div>
          </div>

          <div className="border-t border-[#ffcc00]/30 pt-2 flex items-center justify-between text-xs">
            <span className="text-[#ffcc00]/70">ZULU SYNC:</span>
            <span className="font-mono font-bold text-[#ffcc00]" suppressHydrationWarning>{zuluTime}</span>
          </div>
        </section>

        {/* Primary Operational Countdown Panel */}
        <section className="border-2 border-[#ffcc00] bg-black p-3 sm:p-4 shadow-[0_0_20px_rgba(255,204,0,0.2)] flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-[#ffcc00]/40 pb-2 mb-2">
            <span className="text-xs font-black tracking-widest text-[#ffcc00] truncate max-w-[200px]">
              {activeTimer.label}
            </span>
            <span
              className={`text-[10px] px-2 py-0.5 font-black tracking-widest ${
                activeTimer.running
                  ? "bg-[#ffcc00] text-black animate-pulse"
                  : activeTimer.timesUp
                  ? "bg-red-600 text-white animate-bounce"
                  : "bg-neutral-800 text-[#ffcc00]/80"
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
          {QUICK_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => handleQuickPreset(p.seconds)}
              className="border border-[#ffcc00]/50 hover:bg-[#ffcc00] hover:text-black text-[#ffcc00] text-xs font-bold px-3 py-1 tracking-wider transition"
            >
              {p.label} ({Math.floor(p.seconds / 60)}M)
            </button>
          ))}
        </div>
      </div>

      {/* Operational Queues (Timers & Alarms) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        {/* Active Timers Queue */}
        <section className="border border-[#ffcc00]/40 bg-black p-3">
          <div className="flex items-center justify-between border-b border-[#ffcc00]/40 pb-2 mb-2">
            <h2 className="text-xs font-black tracking-widest text-[#ffcc00]">ARMED MISSION TIMERS</h2>
            <button
              onClick={handleAddTimer}
              className="bg-[#ffcc00] text-black px-2 py-0.5 text-[11px] font-black tracking-wider hover:bg-[#ffcc00]/80"
            >
              + NEW TIMER
            </button>
          </div>
          <div className="space-y-2">
            {timers.map((t) => {
              const dig = formatDigits(t.remainingSec);
              const isSelected = t.id === activeTimerId;
              return (
                <div
                  key={t.id}
                  onClick={() => setActiveTimerId(t.id)}
                  className={`border p-2 cursor-pointer transition ${
                    isSelected
                      ? "border-[#ffcc00] bg-[#ffcc00]/10 shadow-[0_0_10px_rgba(255,204,0,0.2)]"
                      : "border-[#ffcc00]/30 hover:border-[#ffcc00]/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold tracking-wider truncate">{t.label}</span>
                    <span className="text-sm font-black tabular-nums shrink-0">
                      {dig.h}:{dig.m}:{dig.s}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span
                      className={`text-[10px] font-bold ${
                        t.running ? "text-emerald-400" : t.timesUp ? "text-red-500" : "text-[#ffcc00]/60"
                      }`}
                    >
                      [{t.status}]
                    </span>
                    <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      {!t.running ? (
                        <button
                          onClick={() => handleExecuteTimer(t.id)}
                          className="px-2 py-0.5 bg-[#ffcc00] text-black text-[10px] font-black"
                        >
                          RUN
                        </button>
                      ) : (
                        <button
                          onClick={() => handlePauseTimer(t.id)}
                          className="px-2 py-0.5 border border-[#ffcc00] text-[10px] font-bold"
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

        {/* Daily Alarms Queue */}
        <section className="border border-[#ffcc00]/40 bg-black p-3">
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

      {/* 10-Second Crisis Countdown Takeover */}
      {countdownTakeover && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4">
          <div className="text-center max-w-md w-full border-2 border-[#ffcc00] bg-black p-6 shadow-[0_0_50px_rgba(255,204,0,0.5)]">
            <div className="text-xs font-black tracking-widest text-[#ffcc00] border-b border-[#ffcc00]/40 pb-2">
              [CRISIS PROTOCOL ACTIVE] {countdownLabel.toUpperCase()}
            </div>
            <div
              className={`text-5xl sm:text-6xl md:text-7xl font-black tabular-nums my-4 tracking-tight ${
                countdownRemaining <= 3 ? "text-red-500 ctu-shake-intense" : "text-[#ffcc00] glow"
              }`}
            >
              00:00:{String(countdownRemaining).padStart(2, "0")}
            </div>
            <div className="flex items-center justify-center gap-3 mt-4">
              <button
                onClick={handleSnooze}
                className="bg-[#ffcc00] text-black font-black text-xs px-4 py-2 hover:bg-[#ffcc00]/80 transition"
              >
                SNOOZE 5M
              </button>
              <button
                onClick={handleDisarmCrisis}
                className="border border-[#ffcc00] text-[#ffcc00] font-black text-xs px-4 py-2 hover:bg-[#ffcc00]/20 transition"
              >
                DISARM
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Critical Zero Emergency Overlay */}
      {crisisOverlay && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4">
          <div className="text-center max-w-md w-full border-2 border-red-600 bg-black p-6 shadow-[0_0_50px_rgba(239,68,68,0.7)] animate-pulse">
            <div className="text-xs font-black tracking-widest text-red-500 border-b border-red-800 pb-2">
              [CRITICAL EMERGENCY] TIME EXPIRED
            </div>
            <div className="text-3xl sm:text-4xl md:text-5xl font-black text-red-600 tracking-tight my-4">
              00:00:00
            </div>
            <p className="text-xs text-red-400 mb-6 tracking-widest">
              {countdownLabel.toUpperCase() || "OPERATION"} HAS REACHED ZERO.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleSnooze}
                className="bg-red-600 text-white font-black text-xs px-5 py-2.5 hover:bg-red-700 transition"
              >
                STAND-DOWN (SNOOZE 5M)
              </button>
              <button
                onClick={handleDisarmCrisis}
                className="border-2 border-red-600 text-red-500 font-black text-xs px-5 py-2.5 hover:bg-red-950 transition"
              >
                TERMINATE ALARM
              </button>
            </div>
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
