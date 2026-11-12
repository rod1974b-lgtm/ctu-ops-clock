// src/routes/index.tsx
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
  id: string;
  label: string;
  durationSec: number;
  remainingSec: number;
  running: boolean;
  timesUp: boolean;
  status: string;
}

export interface OperationalAlarm {
  id: string;
  label: string;
  hour: number;
  minute: number;
  days: number[]; // 0 = Sun, 1 = Mon, ..., 6 = Sat
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
  {
    id: "timer-alpha",
    label: "ALPHA: RECON INSERTION",
    durationSec: 25 * 60,
    remainingSec: 25 * 60,
    running: false,
    timesUp: false,
    status: "STANDBY",
  },
  {
    id: "timer-bravo",
    label: "BRAVO: SATELLITE PASS",
    durationSec: 45 * 60,
    remainingSec: 45 * 60,
    running: false,
    timesUp: false,
    status: "STANDBY",
  },
];

const INITIAL_ALARMS: OperationalAlarm[] = [
  {
    id: "alarm-briefing",
    label: "MANDATORY BRIEFING",
    hour: 7,
    minute: 0,
    days: [1, 2, 3, 4, 5],
    armed: true,
  },
  {
    id: "alarm-shift",
    label: "SHIFT COMMENCEMENT",
    hour: 14,
    minute: 30,
    days: [0, 1, 2, 3, 4, 5, 6],
    armed: true,
  },
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

function CTUTerminalV74() {
  const [mounted, setMounted] = useState(false);

  // Time & Bangkok Clock
  const [nowDate, setNowDate] = useState<Date>(() => new Date());
  const [colonVisible, setColonVisible] = useState(true);

  // Audio & Master Volume
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [masterVol, setMasterVol] = useState(85);
  const [zeroSound, setZeroSound] = useState<ZeroSoundType>("voice");

  // Operational Queues
  const [timers, setTimers] = useState<OperationalTimer[]>(() => {
    if (typeof window === "undefined") return INITIAL_TIMERS;
    try {
      const saved = localStorage.getItem("ctu_timers_v74");
      return saved ? JSON.parse(saved) : INITIAL_TIMERS;
    } catch {
      return INITIAL_TIMERS;
    }
  });

  const [alarms, setAlarms] = useState<OperationalAlarm[]>(() => {
    if (typeof window === "undefined") return INITIAL_ALARMS;
    try {
      const saved = localStorage.getItem("ctu_alarms_v74");
      return saved ? JSON.parse(saved) : INITIAL_ALARMS;
    } catch {
      return INITIAL_ALARMS;
    }
  });

  const [activeTimerId, setActiveTimerId] = useState<string>("timer-alpha");

  // Unified Samsung HH:MM:SS Time Picker
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

  // Countdown & Crisis Takeover Protocol
  const [countdownTakeover, setCountdownTakeover] = useState(false);
  const [countdownRemaining, setCountdownRemaining] = useState(10);
  const [countdownLabel, setCountdownLabel] = useState("");
  const [crisisOverlay, setCrisisOverlay] = useState(false);

  // Modals & Media
  const [openingOpen, setOpeningOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);

  // OS Background Notifications
  const [osAlertStatus, setOsAlertStatus] = useState<NotificationPermission>("default");
  const lastAlarmTriggerRef = useRef<Record<string, string>>({});
  const lastCountdownSecondRef = useRef<number | null>(null);

  // Client Mount
  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined" && "Notification" in window) {
      setOsAlertStatus(Notification.permission);
    }
  }, []);

  // Unlock Audio on First User Gesture
  const unlockAudio = useCallback(() => {
    if (!audioUnlocked) {
      CTUAudio.unlock();
      setAudioUnlocked(true);
    }
  }, [audioUnlocked]);

  // Persist Timers & Alarms
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

  // Service Worker Messaging Helper
  const postToWorker = useCallback((msg: unknown) => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(msg);
    } else {
      navigator.serviceWorker.ready.then((reg) => {
        reg.active?.postMessage(msg);
      }).catch(() => {});
    }
  }, []);

  // Schedule / Cancel Background Alerts
  const scheduleTimerBackground = useCallback(
    (timer: OperationalTimer) => {
      if (osAlertStatus !== "granted") return;
      const targetEpochMs = Date.now() + timer.remainingSec * 1000;
      postToWorker({
        type: "SCHEDULE_ALERT",
        id: timer.id,
        label: timer.label,
        title: `[CTU CRISIS ALERT] ${timer.label.toUpperCase()} AT ZERO`,
        body: `Operation reached zero. Return to tactical terminal immediately.`,
        delayMs: timer.remainingSec * 1000,
        targetEpochMs,
        epochMs: targetEpochMs,
      });

      try {
        const stored: StoredDeadline[] = JSON.parse(localStorage.getItem("ctu_active_deadlines") || "[]");
        const filtered = stored.filter((s) => s.id !== timer.id);
        filtered.push({
          id: timer.id,
          label: timer.label,
          targetEpochMs,
          type: "timer",
        });
        localStorage.setItem("ctu_active_deadlines", JSON.stringify(filtered));
      } catch {}
    },
    [osAlertStatus, postToWorker]
  );

  const cancelTimerBackground = useCallback(
    (id: string) => {
      postToWorker({ type: "CANCEL_ALERT", id });
      try {
        const stored: StoredDeadline[] = JSON.parse(localStorage.getItem("ctu_active_deadlines") || "[]");
        localStorage.setItem("ctu_active_deadlines", JSON.stringify(stored.filter((s) => s.id !== id)));
      } catch {}
    },
    [postToWorker]
  );

  const scheduleAlarmBackground = useCallback(
    (alarm: OperationalAlarm) => {
      if (osAlertStatus !== "granted" || !alarm.armed) return;
      const now = new Date();
      const nextTime = nextAlarm(now, [{ hour: alarm.hour, minute: alarm.minute, days: alarm.days }]);
      if (!nextTime) return;

      const delayMs = nextTime.getTime() - now.getTime();
      postToWorker({
        type: "SCHEDULE_ALERT",
        id: alarm.id,
        label: alarm.label,
        title: `[CTU ALARM DISPATCH] ${alarm.label.toUpperCase()}`,
        body: `Scheduled tactical alarm for ${String(alarm.hour).padStart(2, "0")}:${String(alarm.minute).padStart(2, "0")} Bangkok Time.`,
        delayMs,
        targetEpochMs: nextTime.getTime(),
        epochMs: nextTime.getTime(),
      });

      try {
        const stored: StoredDeadline[] = JSON.parse(localStorage.getItem("ctu_active_deadlines") || "[]");
        const filtered = stored.filter((s) => s.id !== alarm.id);
        filtered.push({
          id: alarm.id,
          label: alarm.label,
          targetEpochMs: nextTime.getTime(),
          type: "alarm",
          days: alarm.days,
        });
        localStorage.setItem("ctu_active_deadlines", JSON.stringify(filtered));
      } catch {}
    },
    [osAlertStatus, postToWorker]
  );

  const cancelAlarmBackground = useCallback(
    (id: string) => {
      postToWorker({ type: "CANCEL_ALERT", id });
      try {
        const stored: StoredDeadline[] = JSON.parse(localStorage.getItem("ctu_active_deadlines") || "[]");
        localStorage.setItem("ctu_active_deadlines", JSON.stringify(stored.filter((s) => s.id !== id)));
      } catch {}
    },
    [postToWorker]
  );

  // Request OS Notification Permissions
  const handleRequestOSAlerts = async () => {
    unlockAudio();
    if (typeof window === "undefined" || !("Notification" in window)) {
      alert("Notification API not supported by this browser.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setOsAlertStatus(permission);
      if (permission === "granted") {
        for (const t of timers) {
          if (t.running) scheduleTimerBackground(t);
        }
        for (const a of alarms) {
          if (a.armed) scheduleAlarmBackground(a);
        }
      }
    } catch {}
  };

  // Operational Clock Loop (1-second tick)
  useEffect(() => {
    const timer = setInterval(() => {
      const current = new Date();
      setNowDate(current);
      setColonVisible((prev) => !prev);

      // Decrement running timers
      setTimers((prev) =>
        prev.map((t) => {
          if (!t.running) return t;
          if (t.remainingSec <= 1) {
            cancelTimerBackground(t.id);
            setCountdownTakeover(false);
            setCrisisOverlay(true);
            setCountdownLabel(t.label);
            CTUAudio.triggerZeroSound(zeroSound);
            return {
              ...t,
              remainingSec: 0,
              running: false,
              timesUp: true,
              status: "EXPIRED",
            };
          }

          const nextSec = t.remainingSec - 1;

          // 10-Second Countdown Takeover
          if (nextSec <= 10 && nextSec > 0) {
            setCountdownTakeover(true);
            setCountdownRemaining(nextSec);
            setCountdownLabel(t.label);

            if (lastCountdownSecondRef.current !== nextSec) {
              lastCountdownSecondRef.current = nextSec;
              const intensity = nextSec <= 3 ? 3 : nextSec <= 5 ? 2 : 1;
              CTUAudio.playCountdownSound(intensity);
            }
          } else if (nextSec > 10 && t.id === activeTimerId && countdownTakeover) {
            setCountdownTakeover(false);
          }

          return { ...t, remainingSec: nextSec };
        })
      );

      // Evaluate Daily Alarms in Bangkok Time (Asia/Bangkok)
      const bkkFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Bangkok",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        hour12: false,
        weekday: "short",
      });
      const parts = bkkFormatter.formatToParts(current);
      const bkkHour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
      const bkkMinute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
      const bkkSecond = parseInt(parts.find((p) => p.type === "second")?.value || "0", 10);

      const dayMap: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
      };
      const weekdayStr = parts.find((p) => p.type === "weekday")?.value || "Sun";
      const bkkDay = dayMap[weekdayStr] ?? 0;

      if (bkkSecond === 0) {
        for (const alarm of alarms) {
          if (!alarm.armed) continue;
          if (alarm.hour === bkkHour && alarm.minute === bkkMinute && alarm.days.includes(bkkDay)) {
            const key = `${alarm.id}-${current.toISOString().slice(0, 10)}-${bkkHour}:${bkkMinute}`;
            if (!lastAlarmTriggerRef.current[key]) {
              lastAlarmTriggerRef.current[key] = "triggered";
              setCountdownLabel(alarm.label);
              setCrisisOverlay(true);
              CTUAudio.triggerZeroSound(zeroSound);
            }
          }
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [alarms, activeTimerId, cancelTimerBackground, countdownTakeover, zeroSound]);

  // Live Lockscreen HUD Synchronization
  useEffect(() => {
    if (osAlertStatus !== "granted") return;

    const running = timers.filter((t) => t.running);
    if (running.length > 0) {
      const closest = [...running].sort((a, b) => a.remainingSec - b.remainingSec)[0];
      if (closest) {
        const m = Math.floor(closest.remainingSec / 60);
        const s = closest.remainingSec % 60;
        postToWorker({
          type: "UPDATE_LOCKSCREEN_HUD",
          title: `[CTU ACTIVE HUD] ${closest.label.toUpperCase()}`,
          body: `Time remaining: ${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} • Tap to expand terminal`,
        });
      }
    } else {
      const armed = alarms.filter((a) => a.armed);
      if (armed.length > 0) {
        const nextTarget = armed[0];
        if (nextTarget) {
          postToWorker({
            type: "UPDATE_LOCKSCREEN_HUD",
            title: `[CTU DEFENSE NET] ${nextTarget.label.toUpperCase()}`,
            body: `Target: ${String(nextTarget.hour).padStart(2, "0")}:${String(nextTarget.minute).padStart(2, "0")} Bangkok Time`,
          });
        }
      } else {
        postToWorker({ type: "CLEAR_LOCKSCREEN_HUD" });
      }
    }
  }, [timers, alarms, osAlertStatus, postToWorker]);

  // Active Timer Reference
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

  // Format Digits
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

  // Bangkok Live Time String
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
    return {
      time: `${h}:${m}:${s}`,
      date: `${day} ${month.toUpperCase()} ${year}`,
    };
  }, [nowDate]);

  // Zulu / UTC Time String
  const zuluTime = useMemo(() => {
    const h = String(nowDate.getUTCHours()).padStart(2, "0");
    const m = String(nowDate.getUTCMinutes()).padStart(2, "0");
    const s = String(nowDate.getUTCSeconds()).padStart(2, "0");
    return `${h}:${m}:${s}Z`;
  }, [nowDate]);

  // Execution Handlers
  const handleExecuteTimer = (id: string) => {
    unlockAudio();
    setTimers((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          const updated = {
            ...t,
            running: true,
            timesUp: false,
            status: "IN PROGRESS",
            remainingSec: t.remainingSec === 0 ? t.durationSec : t.remainingSec,
          };
          scheduleTimerBackground(updated);
          return updated;
        }
        return t;
      })
    );
  };

  const handlePauseTimer = (id: string) => {
    unlockAudio();
    cancelTimerBackground(id);
    setTimers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, running: false, status: "HOLD" } : t))
    );
  };

  const handleResetTimer = (id: string) => {
    unlockAudio();
    cancelTimerBackground(id);
    if (countdownTakeover) setCountdownTakeover(false);
    CTUAudio.stopCountdownSound();
    setTimers((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              running: false,
              timesUp: false,
              status: "STANDBY",
              remainingSec: t.durationSec,
            }
          : t
      )
    );
  };

  const handleQuickPreset = (seconds: number) => {
    unlockAudio();
    cancelTimerBackground(activeTimer.id);
    if (countdownTakeover) setCountdownTakeover(false);
    setTimers((prev) =>
      prev.map((t) =>
        t.id === activeTimer.id
          ? {
              ...t,
              durationSec: seconds,
              remainingSec: seconds,
              running: false,
              timesUp: false,
              status: "STANDBY",
            }
          : t
      )
    );
  };

  // Samsung Picker Trigger
  const handleEditTimer = (timer: OperationalTimer) => {
    unlockAudio();
    setPickerMode("timer");
    setEditingItemId(timer.id);
    const h = Math.floor(timer.durationSec / 3600);
    const m = Math.floor((timer.durationSec % 3600) / 60);
    const s = timer.durationSec % 60;
    setPickerInitial({
      hours: h,
      minutes: m,
      seconds: s,
      totalSeconds: timer.durationSec,
    });
    setPickerOpen(true);
  };

  const handleAddTimer = () => {
    unlockAudio();
    setPickerMode("timer");
    setEditingItemId(null);
    setPickerInitial({
      hours: 0,
      minutes: 15,
      seconds: 0,
      totalSeconds: 15 * 60,
    });
    setPickerOpen(true);
  };

  const handleDeleteTimer = (id: string) => {
    unlockAudio();
    cancelTimerBackground(id);
    setTimers((prev) => {
      const remaining = prev.filter((t) => t.id !== id);
      if (remaining.length === 0) return INITIAL_TIMERS;
      if (activeTimerId === id && remaining[0]) {
        setActiveTimerId(remaining[0].id);
      }
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
    setPickerInitial({
      hours: 8,
      minutes: 0,
      seconds: 0,
      days: [1, 2, 3, 4, 5],
      totalSeconds: 8 * 3600,
    });
    setPickerOpen(true);
  };

  const handleToggleAlarm = (id: string) => {
    unlockAudio();
    setAlarms((prev) =>
      prev.map((a) => {
        if (a.id === id) {
          const nextState = !a.armed;
          if (nextState) {
            scheduleAlarmBackground({ ...a, armed: true });
          } else {
            cancelAlarmBackground(a.id);
          }
          return { ...a, armed: nextState };
        }
        return a;
      })
    );
  };

  const handleDeleteAlarm = (id: string) => {
    unlockAudio();
    cancelAlarmBackground(id);
    setAlarms((prev) => prev.filter((a) => a.id !== id));
  };

  // Confirm values from Samsung HH:MM:SS Time Picker
  const handlePickerConfirm = (vals: SamsungTimePickerValues) => {
    unlockAudio();
    if (pickerMode === "timer") {
      const totalSec = Math.max(1, vals.hours * 3600 + vals.minutes * 60 + vals.seconds);
      if (editingItemId) {
        setTimers((prev) =>
          prev.map((t) =>
            t.id === editingItemId
              ? {
                  ...t,
                  durationSec: totalSec,
                  remainingSec: totalSec,
                  running: false,
                  timesUp: false,
                  status: "STANDBY",
                }
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
            if (a.id === editingItemId) {
              const updated = {
                ...a,
                hour: vals.hours,
                minute: vals.minutes,
                days,
              };
              if (updated.armed) scheduleAlarmBackground(updated);
              return updated;
            }
            return a;
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

  // Snooze and Disarm Handlers
  const handleSnooze = () => {
    unlockAudio();
    setCrisisOverlay(false);
    setCountdownTakeover(false);
    CTUAudio.stopCrisisAudio();
    CTUAudio.stopCountdownSound();
    setTimers((prev) =>
      prev.map((t) =>
        t.id === activeTimerId
          ? {
              ...t,
              remainingSec: 5 * 60,
              running: true,
              timesUp: false,
              status: "SNOOZE (5M)",
            }
          : t
      )
    );
  };

  const handleDisarm = () => {
    unlockAudio();
    setCrisisOverlay(false);
    setCountdownTakeover(false);
    CTUAudio.stopCrisisAudio();
    CTUAudio.stopCountdownSound();
    setTimers((prev) =>
      prev.map((t) =>
        t.id === activeTimerId
          ? {
              ...t,
              remainingSec: t.durationSec,
              running: false,
              timesUp: false,
              status: "STANDBY",
            }
          : t
      )
    );
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

  const handleOpenOpening = () => {
    unlockAudio();
    setOpeningOpen(true);
  };

  const handleCloseOpening = () => {
    setOpeningOpen(false);
  };

  return (
    <main
      onClick={unlockAudio}
      className="min-h-screen bg-black text-[#ffcc00] font-mono select-none overflow-x-hidden p-2 sm:p-4 md:p-6"
    >
      {/* Top Banner & Security Header */}
      <header className="border-2 border-[#ffcc00] bg-black p-3 mb-4 shadow-[0_0_20px_rgba(255,204,0,0.15)] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 bg-[#ffcc00] flex items-center justify-center font-black text-black text-xs">
            24
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-black tracking-widest text-[#ffcc00]">
              CTU OPERATIONAL COMMAND TERMINAL
            </h1>
            <p className="text-[10px] tracking-wider text-[#ffcc00]/70">
              COUNTER TERRORIST UNIT • SOUTHEAST ASIA DIVISION • DIRECTIVE 74
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {osAlertStatus !== "granted" ? (
            <button
              onClick={handleRequestOSAlerts}
              className="px-2.5 py-1 bg-amber-500/20 border border-[#ffcc00] text-[#ffcc00] text-xs font-bold tracking-wider hover:bg-[#ffcc00] hover:text-black transition flex items-center gap-1.5 animate-pulse"
              title="Enable background notifications when tab is closed"
            >
              <span>LINK OS ALERTS</span>
            </button>
          ) : (
            <span className="px-2.5 py-1 border border-[#ffcc00]/40 text-[#ffcc00]/80 text-[11px] font-bold">
              OS ALERTS: ARMED
            </span>
          )}

          <button
            onClick={handleOpenOpening}
            className="px-2 py-1 border border-[#ffcc00]/60 text-xs font-bold hover:bg-[#ffcc00] hover:text-black transition"
          >
            OPENING FEED
          </button>
          <button
            onClick={handleOpenCredits}
            className="px-2 py-1 border border-[#ffcc00]/60 text-xs font-bold hover:bg-[#ffcc00] hover:text-black transition"
          >
            CREDITS
          </button>
        </div>
      </header>

      {/* World Theaters Chronological Ticker */}
      <div className="w-full bg-black/80 border border-[#ffcc00]/30 py-1 px-2 mb-4 overflow-x-auto whitespace-nowrap scrollbar-none flex items-center gap-6 text-[11px] text-[#ffcc00]/70">
        <span className="font-bold text-[#ffcc00] tracking-widest">WORLD THEATERS:</span>
        {WORLD_THEATERS.map((wt) => {
          const tStr = new Intl.DateTimeFormat("en-US", {
            timeZone: wt.tz,
            hour: "numeric",
            minute: "numeric",
            second: "numeric",
            hour12: false,
          }).format(nowDate);
          return (
            <div key={wt.city} className="inline-flex items-center gap-1.5">
              <span className="text-[#ffcc00]/50">{wt.city}:</span>
              <strong className="text-[#ffcc00] font-mono">{tStr}</strong>
            </div>
          );
        })}
      </div>

      {/* Main Grid: Mission Clock & Operational Countdown Console */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Mission Clock Panel */}
        <section className="border-2 border-[#ffcc00] bg-black p-3 sm:p-4 flex flex-col justify-between shadow-[0_0_25px_rgba(255,204,0,0.2)]">
          <div className="flex items-center justify-between border-b border-[#ffcc00]/40 pb-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#ffcc00] animate-ping" />
              <span className="text-xs font-black tracking-widest text-[#ffcc00]">
                ACTIVE THEATER: BANGKOK HQ (UTC+7)
              </span>
            </div>
            <span className="text-[11px] text-[#ffcc00]/70 tabular-nums">
              ZULU: <strong className="text-[#ffcc00]">{zuluTime}</strong>
            </span>
          </div>

          {/* Rescaled tactical mission clock digits */}
          <div className="flex flex-col items-center justify-center my-3 sm:my-4 py-1">
            <div className="text-3xl sm:text-4xl md:text-5xl font-black text-[#ffcc00] tracking-tight tabular-nums glow text-center">
              {bangkokTime.time.split(":").map((part, idx, arr) => (
                <span key={idx}>
                  {part}
                  {idx < arr.length - 1 && (
                    <span className={colonVisible ? "opacity-100 text-[#ffcc00]" : "opacity-20 text-[#ffcc00]/40"}>
                      :
                    </span>
                  )}
                </span>
              ))}
            </div>
            <div className="mt-1.5 text-xs tracking-widest text-[#ffcc00]/70 font-bold">
              {bangkokTime.date}
            </div>
          </div>

          <div className="border-t border-[#ffcc00]/30 pt-2 flex items-center justify-between text-[11px] text-[#ffcc00]/60">
            <span>SYNCHRONIZED WITH CTU SATELLITE NETWORK</span>
            <span className="text-[#ffcc00] font-bold">SIGNAL LOCK: 100%</span>
          </div>
        </section>

        {/* Primary Operational Countdown Console */}
        <section className="border-2 border-[#ffcc00] bg-black p-3 sm:p-4 flex flex-col justify-between shadow-[0_0_25px_rgba(255,204,0,0.2)]">
          <div className="flex items-center justify-between border-b border-[#ffcc00]/40 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black tracking-widest text-[#ffcc00]">
                {activeTimer.label}
              </span>
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

          {/* Rescaled tactical primary timer digits */}
          <div
            onClick={() => handleEditTimer(activeTimer)}
            className="flex flex-col items-center justify-center my-3 sm:my-4 py-1 cursor-pointer group"
            title="Tap to adjust operational duration"
          >
            <div className="text-3xl sm:text-4xl md:text-5xl font-black text-[#ffcc00] tracking-tight tabular-nums glow group-hover:scale-[1.02] transition-transform text-center">
              {primaryDigits.h}:{primaryDigits.m}:{primaryDigits.s}
            </div>
            <div className="mt-1.5 text-[10px] tracking-widest text-[#ffcc00]/60 group-hover:text-[#ffcc00] transition">
              TAP DIGITS TO MODIFY TIME (SAMSUNG HH:MM:SS)
            </div>
          </div>

          {/* Execution Command Bar */}
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

            <button
              onClick={() => handleEditTimer(activeTimer)}
              className="border border-[#ffcc00]/50 text-[#ffcc00]/80 font-bold text-xs sm:text-sm tracking-widest py-2 px-4 hover:border-[#ffcc00] hover:text-[#ffcc00] active:scale-95 transition"
            >
              MODIFY
            </button>
          </div>
        </section>
      </div>

      {/* Quick-Arm Tactical Presets */}
      <div className="border border-[#ffcc00]/40 bg-black p-2.5 mb-4 flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs font-black tracking-widest text-[#ffcc00]">
          QUICK-ARM PRESETS:
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          {QUICK_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => handleQuickPreset(p.seconds)}
              className="px-2.5 py-1 border border-[#ffcc00]/40 text-xs font-bold tracking-wider hover:bg-[#ffcc00] hover:text-black transition"
            >
              {p.label} ({p.seconds / 60}M)
            </button>
          ))}
        </div>
      </div>

      {/* Tactical Queues: Multi-Timers & Weekly Alarms */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Multi-Timer Operational Queue */}
        <section className="border border-[#ffcc00]/40 bg-black p-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#ffcc00]/30 pb-2 mb-2">
              <span className="text-xs font-black tracking-widest text-[#ffcc00]">
                ACTIVE TIMERS QUEUE ({timers.length})
              </span>
              <button
                onClick={handleAddTimer}
                className="px-2 py-0.5 border border-[#ffcc00] text-[11px] font-black hover:bg-[#ffcc00] hover:text-black transition"
              >
                + ADD TIMER
              </button>
            </div>

            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
              {timers.map((t) => {
                const d = formatDigits(t.remainingSec);
                const isFocused = t.id === activeTimerId;
                return (
                  <div
                    key={t.id}
                    onClick={() => setActiveTimerId(t.id)}
                    className={`p-2 border flex items-center justify-between cursor-pointer transition ${
                      isFocused
                        ? "border-[#ffcc00] bg-[#ffcc00]/10 shadow-[0_0_12px_rgba(255,204,0,0.2)]"
                        : "border-[#ffcc00]/20 hover:border-[#ffcc00]/50"
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold text-[#ffcc00]">{t.label}</div>
                      <div className="text-[10px] text-[#ffcc00]/60">
                        STATUS: {t.status}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono text-base font-black text-[#ffcc00] tabular-nums">
                        {d.h}:{d.m}:{d.s}
                      </span>

                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        {!t.running ? (
                          <button
                            onClick={() => handleExecuteTimer(t.id)}
                            className="px-2 py-0.5 text-[10px] font-black border border-[#ffcc00] hover:bg-[#ffcc00] hover:text-black transition"
                          >
                            RUN
                          </button>
                        ) : (
                          <button
                            onClick={() => handlePauseTimer(t.id)}
                            className="px-2 py-0.5 text-[10px] font-black border border-[#ffcc00]/60 hover:bg-[#ffcc00]/20 transition"
                          >
                            PAUSE
                          </button>
                        )}
                        <button
                          onClick={() => handleEditTimer(t)}
                          className="px-1.5 py-0.5 text-[10px] border border-[#ffcc00]/40 text-[#ffcc00]/70 hover:text-[#ffcc00] transition"
                        >
                          EDIT
                        </button>
                        <button
                          onClick={() => handleDeleteTimer(t.id)}
                          className="px-1.5 py-0.5 text-[10px] border border-red-800 text-red-500 hover:bg-red-950 transition"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Weekly Recurring Alarms Queue */}
        <section className="border border-[#ffcc00]/40 bg-black p-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#ffcc00]/30 pb-2 mb-2">
              <span className="text-xs font-black tracking-widest text-[#ffcc00]">
                WEEKLY ALARMS ({alarms.length})
              </span>
              <button
                onClick={handleAddAlarm}
                className="px-2 py-0.5 border border-[#ffcc00] text-[11px] font-black hover:bg-[#ffcc00] hover:text-black transition"
              >
                + ADD ALARM
              </button>
            </div>

            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
              {alarms.map((a) => {
                const dayInitials = ["S", "M", "T", "W", "T", "F", "S"];
                return (
                  <div
                    key={a.id}
                    className="p-2 border border-[#ffcc00]/20 hover:border-[#ffcc00]/50 flex items-center justify-between transition"
                  >
                    <div>
                      <div className="text-xs font-bold text-[#ffcc00]">{a.label}</div>
                      <div className="flex items-center gap-1 mt-1">
                        {dayInitials.map((initial, idx) => (
                          <span
                            key={idx}
                            className={`w-3.5 h-3.5 rounded-full text-[9px] flex items-center justify-center font-bold ${
                              a.days.includes(idx)
                                ? "bg-[#ffcc00] text-black"
                                : "text-[#ffcc00]/30 border border-[#ffcc00]/20"
                            }`}
                          >
                            {initial}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono text-lg font-black text-[#ffcc00] tabular-nums">
                        {String(a.hour).padStart(2, "0")}:{String(a.minute).padStart(2, "0")}
                      </span>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleToggleAlarm(a.id)}
                          className={`px-2 py-0.5 text-[10px] font-black border transition ${
                            a.armed
                              ? "bg-[#ffcc00] text-black border-[#ffcc00]"
                              : "border-[#ffcc00]/40 text-[#ffcc00]/40"
                          }`}
                        >
                          {a.armed ? "ARMED" : "OFF"}
                        </button>
                        <button
                          onClick={() => handleEditAlarm(a)}
                          className="px-1.5 py-0.5 text-[10px] border border-[#ffcc00]/40 text-[#ffcc00]/70 hover:text-[#ffcc00] transition"
                        >
                          EDIT
                        </button>
                        <button
                          onClick={() => handleDeleteAlarm(a.id)}
                          className="px-1.5 py-0.5 text-[10px] border border-red-800 text-red-500 hover:bg-red-950 transition"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {/* Audio Matrix & Operational Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Audio Synthesis Matrix */}
        <section className="border border-[#ffcc00]/30 bg-black p-3">
          <div className="flex items-center justify-between border-b border-[#ffcc00]/30 pb-2 mb-3">
            <span className="text-xs font-black tracking-widest text-[#ffcc00]">
              AUDIO MATRIX & HARNESS
            </span>
            <span className="text-[10px] text-[#ffcc00]/60">SYNTHESIZED WEB AUDIO</span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#ffcc00]/80">MASTER VOLUME</span>
              <div className="flex items-center gap-3 w-48">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={masterVol}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setMasterVol(val);
                    CTUAudio.setMasterVolume(val / 100);
                  }}
                  className="w-full accent-[#ffcc00] cursor-pointer"
                />
                <span className="text-xs font-bold text-[#ffcc00] w-8 text-right">
                  {masterVol}%
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-[#ffcc00]/80">CRISIS ZERO SOUND</span>
              <select
                value={zeroSound}
                onChange={(e) => {
                  const val = e.target.value as ZeroSoundType;
                  setZeroSound(val);
                  CTUAudio.triggerZeroSound(val);
                }}
                className="bg-black border border-[#ffcc00] text-[#ffcc00] text-xs font-bold p-1 focus:outline-none"
              >
                {Object.entries(ZERO_SOUND_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#ffcc00]/20">
              <span className="text-xs text-[#ffcc00]/80">TEST AUDIO NODES</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => CTUAudio.tick()}
                  className="px-2 py-0.5 border border-[#ffcc00]/40 text-xs hover:bg-[#ffcc00] hover:text-black transition"
                >
                  TICK
                </button>
                <button
                  onClick={() => CTUAudio.chirp()}
                  className="px-2 py-0.5 border border-[#ffcc00]/40 text-xs hover:bg-[#ffcc00] hover:text-black transition"
                >
                  CHIRP
                </button>
                <button
                  onClick={() => CTUAudio.triggerZeroSound(zeroSound)}
                  className="px-2 py-0.5 border border-[#ffcc00] text-xs font-bold bg-[#ffcc00]/20 hover:bg-[#ffcc00] hover:text-black transition"
                >
                  ZERO
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Security Matrix Protocol Status */}
        <section className="border border-[#ffcc00]/30 bg-black p-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#ffcc00]/30 pb-2 mb-3">
              <span className="text-xs font-black tracking-widest text-[#ffcc00]">
                TACTICAL PROTOCOL SPECIFICATION
              </span>
              <span className="text-[10px] text-[#ffcc00]/60">DEFCON 2</span>
            </div>

            <div className="text-xs text-[#ffcc00]/70 space-y-1.5">
              <p>• PRIMARY THEATER: BANGKOK HEADQUARTERS (UTC+7)</p>
              <p>• BACKGROUND EXECUTION: SERVICE WORKER DRIFT-FREE ENGINE</p>
              <p>• LOCKSCREEN HUD: LIVE TICKER WITH DIRECT SNOOZE / DISARM</p>
              <p>• 10-SECOND TAKEOVER: RED PULSE & ESCALATING STINGER HARNESS</p>
            </div>
          </div>

          <div className="pt-3 border-t border-[#ffcc00]/20 text-[10px] text-[#ffcc00]/50 flex justify-between items-center">
            <span>SOUND HARNESS: CTU SYNTHESIS v74</span>
            <span className="text-[#ffcc00]">READY</span>
          </div>
        </section>
      </div>

      {/* Samsung HH:MM:SS Unified Time Picker Modal */}
      {pickerOpen && (
        <SamsungTimePicker
          isOpen={pickerOpen}
          mode={pickerMode}
          initialValues={pickerInitial}
          onConfirm={handlePickerConfirm}
          onSave={handlePickerConfirm}
          onCancel={() => setPickerOpen(false)}
        />
      )}

      {/* 24 Opening Video Modal */}
      {openingOpen && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-4xl border-2 border-[#ffcc00] bg-black p-3 relative flex flex-col shadow-[0_0_30px_rgba(255,204,0,0.3)]">
            <div className="flex items-center justify-between border-b border-[#ffcc00] pb-2 mb-2">
              <span className="text-xs font-black tracking-widest text-[#ffcc00]">
                CTU BROADCAST FEED • 24 OPENING
              </span>
              <button
                onClick={handleCloseOpening}
                className="px-2 py-0.5 border border-[#ffcc00] text-xs font-black hover:bg-[#ffcc00] hover:text-black transition"
              >
                ✕ CLOSE
              </button>
            </div>
            <div className="relative aspect-video bg-black flex items-center justify-center border border-[#ffcc00]/30 overflow-hidden">
              <video
                src="/24 Countdown.mp4"
                autoPlay
                controls
                playsInline
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* 24 Watercolor Ending Credits Modal */}
      {creditsOpen && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-4xl border-2 border-[#ffcc00] bg-black p-3 relative flex flex-col shadow-[0_0_30px_rgba(255,204,0,0.3)]">
            <div className="flex items-center justify-between border-b border-[#ffcc00] pb-2 mb-2">
              <span className="text-xs font-black tracking-widest text-[#ffcc00]">
                CTU DEBRIEF • 24 ENDING CREDITS (WATERCOLOR GRID)
              </span>
              <button
                onClick={handleCloseCredits}
                className="px-2 py-0.5 border border-[#ffcc00] text-xs font-black hover:bg-[#ffcc00] hover:text-black transition"
              >
                ✕ CLOSE
              </button>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1 p-2 max-h-[70vh] overflow-y-auto">
              {Array.from({ length: 32 }, (_, i) => (
                <div
                  key={i}
                  className="aspect-square bg-neutral-900 border border-[#ffcc00]/20 flex items-center justify-center overflow-hidden"
                >
                  <img
                    src={`/24_accurate_watercolors_final/${String(i + 1).padStart(2, "0")}.webp`}
                    alt={`Credit Frame ${i + 1}`}
                    className="w-full h-full object-cover filter contrast-125"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = "none";
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 10-Second Crisis Countdown Takeover Modal */}
      {countdownTakeover && (
        <div className="fixed inset-0 z-40 bg-black/90 flex flex-col items-center justify-center p-4 animate-in fade-in duration-200">
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
                onClick={handleDisarm}
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
                onClick={handleDisarm}
                className="border-2 border-red-600 text-red-500 font-black text-xs px-5 py-2.5 hover:bg-red-950 transition"
              >
                TERMINATE ALARM
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
