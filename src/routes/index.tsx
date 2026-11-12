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
    id: "timer-1",
    label: "TACTICAL SPRINT",
    durationSec: 25 * 60,
    remainingSec: 25 * 60,
    running: false,
    timesUp: false,
    status: "STANDBY",
  },
  {
    id: "timer-2",
    label: "FIELD INTERROGATION",
    durationSec: 15 * 60,
    remainingSec: 15 * 60,
    running: false,
    timesUp: false,
    status: "STANDBY",
  },
  {
    id: "timer-3",
    label: "SATELLITE RECON PASS",
    durationSec: 45 * 60,
    remainingSec: 45 * 60,
    running: false,
    timesUp: false,
    status: "STANDBY",
  },
];

const INITIAL_ALARMS: OperationalAlarm[] = [
  {
    id: "alarm-1",
    label: "DAILY BRIEFING",
    hour: 8,
    minute: 0,
    days: [1, 2, 3, 4, 5],
    armed: true,
  },
  {
    id: "alarm-2",
    label: "PERIMETER DEFENSE SWEEP",
    hour: 20,
    minute: 30,
    days: [0, 1, 2, 3, 4, 5, 6],
    armed: false,
  },
];

const CTU_PRESETS = [
  { label: "FIELD STAND-DOWN", sec: 5 * 60 },
  { label: "INTERROGATION", sec: 15 * 60 },
  { label: "TACTICAL SPRINT", sec: 25 * 60 },
  { label: "SATELLITE PASS", sec: 45 * 60 },
  { label: "PERIMETER LOCK", sec: 60 * 60 },
];

const WEEK_DAYS = [
  { day: 0, short: "S", name: "Sun" },
  { day: 1, short: "M", name: "Mon" },
  { day: 2, short: "T", name: "Tue" },
  { day: 3, short: "W", name: "Wed" },
  { day: 4, short: "T", name: "Thu" },
  { day: 5, short: "F", name: "Fri" },
  { day: 6, short: "S", name: "Sat" },
];

function formatDaysSummary(days: number[]): string {
  if (!days || days.length === 0) return "ONCE";
  if (days.length === 7) return "EVERY DAY";
  const sorted = [...days].sort((a, b) => a - b);
  const isWeekdays = sorted.length === 5 && sorted.every((d, i) => d === i + 1);
  if (isWeekdays) return "WEEKDAYS";
  const isWeekends = sorted.length === 2 && sorted.includes(0) && sorted.includes(6);
  if (isWeekends) return "WEEKENDS";
  const map: Record<number, string> = { 0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat" };
  return sorted.map((d) => map[d]).join(", ");
}

const GLOBAL_THEATERS = [
  { code: "LAX", city: "LOS ANGELES (CTU HQ)", zone: "America/Los_Angeles" },
  { code: "WAS", city: "WASHINGTON D.C.", zone: "America/New_York" },
  { code: "NYC", city: "NEW YORK", zone: "America/New_York" },
  { code: "SAO", city: "SÃO PAULO", zone: "America/Sao_Paulo" },
  { code: "UTC", city: "ZULU HQ", zone: "UTC" },
  { code: "LON", city: "LONDON (MI6)", zone: "Europe/London" },
  { code: "PAR", city: "PARIS", zone: "Europe/Paris" },
  { code: "BER", city: "BERLIN", zone: "Europe/Berlin" },
  { code: "CAI", city: "CAIRO", zone: "Africa/Cairo" },
  { code: "MOW", city: "MOSCOW", zone: "Europe/Moscow" },
  { code: "DXB", city: "DUBAI", zone: "Asia/Dubai" },
  { code: "BKK", city: "BANGKOK [ACTIVE]", zone: "Asia/Bangkok", isHome: true },
  { code: "SIN", city: "SINGAPORE", zone: "Asia/Singapore" },
  { code: "HKG", city: "HONG KONG", zone: "Asia/Hong_Kong" },
  { code: "TYO", city: "TOKYO", zone: "Asia/Tokyo" },
  { code: "SYD", city: "SYDNEY", zone: "Australia/Sydney" },
  { code: "AKL", city: "AUCKLAND", zone: "Pacific/Auckland" },
  { code: "HNL", city: "HONOLULU", zone: "Pacific/Honolulu" },
];

const WATERCOLOR_IMAGES = [
  "/24_accurate_watercolors_final/image_20260922_210052.webp",
  "/24_accurate_watercolors_final/image_20260922_210055.webp",
  "/24_accurate_watercolors_final/image_20260922_210058.webp",
  "/24_accurate_watercolors_final/image_20260922_210101.webp",
  "/24_accurate_watercolors_final/image_20260922_210104.webp",
  "/24_accurate_watercolors_final/image_20260922_210107.webp",
  "/24_accurate_watercolors_final/image_20260922_210110.webp",
  "/24_accurate_watercolors_final/image_20260922_210113.webp",
  "/24_accurate_watercolors_final/image_20260922_210116.webp",
  "/24_accurate_watercolors_final/image_20260922_210119.webp",
  "/24_accurate_watercolors_final/image_20260922_210122.webp",
  "/24_accurate_watercolors_final/image_20260922_210125.webp",
];

const SURVEILLANCE_CHANNELS = [
  { id: "FEED-ALPHA", name: "CTU LOS ANGELES PERIMETER", status: "FEED LIVE", type: "grid" },
  { id: "FEED-BRAVO", name: "BANGKOK SECTOR 4 COVERT", status: "ENCRYPTED", type: "scan" },
  { id: "FEED-CHARLIE", name: "SATELLITE THERMAL OVERLAY", status: "TELEMETRY", type: "thermal" },
  { id: "FEED-DELTA", name: "TACTICAL SECURE ARCHIVE", status: "STANDBY", type: "archive" },
];

function CTUTerminalV74() {
  const [nowDate, setNowDate] = useState<Date | null>(null);
  const [colonVisible, setColonVisible] = useState(true);

  // Audio & Media State
  const [masterVol, setMasterVol] = useState<number>(0.85);
  const [zeroSound, setZeroSound] = useState<ZeroSoundType>("voice");
  const [creditsMusic, setCreditsMusic] = useState<boolean>(true);
  const [creditsMode, setCreditsMode] = useState<"watercolor" | "video">("watercolor");

  // Operational Queues
  const [timers, setTimers] = useState<OperationalTimer[]>(INITIAL_TIMERS);
  const [alarms, setAlarms] = useState<OperationalAlarm[]>(INITIAL_ALARMS);
  const [activeTimerId, setActiveTimerId] = useState<string>("timer-1");

  // OS Background Notifications State
  const [osAlertStatus, setOsAlertStatus] = useState<NotificationPermission>("default");

  // Modals & Panels
  const [openingOpen, setOpeningOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [creditsImageOffset, setCreditsImageOffset] = useState(0);

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

  // Fullscreen Countdown / Crisis Takeover State
  const [countdownActive, setCountdownActive] = useState(false);
  const [countdownRemaining, setCountdownRemaining] = useState(10);
  const [countdownLabel, setCountdownLabel] = useState("");
  const [crisisTimesUp, setCrisisTimesUp] = useState(false);

  // Active Sound Staging
  const countdownAudioRef = useRef<HTMLAudioElement | null>(null);
  const zeroAudioRef = useRef<HTMLAudioElement | null>(null);

  // Audio Unlock on First Touch
  const unlockAudio = useCallback(() => {
    CTUAudio.unlock();
  }, []);

  // Post message to Service Worker safely
  const postToWorker = useCallback((message: unknown) => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage(message);
      } else {
        navigator.serviceWorker.ready.then((registration) => {
          registration.active?.postMessage(message);
        });
      }
    }
  }, []);

  // Save deadline to localStorage for background wake catch-up
  const saveDeadline = useCallback((item: StoredDeadline) => {
    try {
      const stored = localStorage.getItem("ctu_active_deadlines");
      const list: StoredDeadline[] = stored ? JSON.parse(stored) : [];
      const updated = list.filter((x) => x.id !== item.id);
      updated.push(item);
      localStorage.setItem("ctu_active_deadlines", JSON.stringify(updated));
    } catch {
      // Ignore
    }
  }, []);

  // Remove deadline from localStorage
  const removeDeadline = useCallback((id: string) => {
    try {
      const stored = localStorage.getItem("ctu_active_deadlines");
      if (stored) {
        const list: StoredDeadline[] = JSON.parse(stored);
        const updated = list.filter((x) => x.id !== id);
        localStorage.setItem("ctu_active_deadlines", JSON.stringify(updated));
      }
    } catch {
      // Ignore
    }
  }, []);

  // Schedule Timer Alert in Service Worker
  const scheduleTimerBackground = useCallback(
    (timerId: string, label: string, remainingSec: number) => {
      const targetEpoch = Date.now() + remainingSec * 1000;
      saveDeadline({ id: timerId, label, targetEpochMs: targetEpoch, type: "timer" });
      postToWorker({
        type: "SCHEDULE_ALERT",
        id: timerId,
        title: `[CTU CRISIS ALERT] ${label.toUpperCase()} AT ZERO`,
        body: "Operational deadline expired. Tactical override active.",
        label,
        delayMs: remainingSec * 1000,
        epochMs: targetEpoch,
        targetEpochMs: targetEpoch,
      });
    },
    [postToWorker, saveDeadline]
  );

  // Cancel Timer Alert in Service Worker
  const cancelTimerBackground = useCallback(
    (timerId: string) => {
      removeDeadline(timerId);
      postToWorker({ type: "CANCEL_ALERT", id: timerId });
    },
    [postToWorker, removeDeadline]
  );

  // Schedule Alarm Alert in Service Worker with Weekly Recurrence
  const scheduleAlarmBackground = useCallback(
    (alarm: OperationalAlarm) => {
      const alarmTimeStr = `${String(alarm.hour).padStart(2, "0")}:${String(alarm.minute).padStart(2, "0")}:00`;
      const targetEpochMs = nextAlarm(alarmTimeStr, Date.now(), alarm.days);
      const delayMs = Math.max(0, targetEpochMs - Date.now());

      saveDeadline({ id: alarm.id, label: alarm.label, targetEpochMs, type: "alarm", days: alarm.days });
      postToWorker({
        type: "SCHEDULE_ALERT",
        id: alarm.id,
        title: `[CTU ALARM] ${alarm.label.toUpperCase()}`,
        body: `Scheduled operation time: ${String(alarm.hour).padStart(2, "0")}:${String(alarm.minute).padStart(2, "0")} BKK (${formatDaysSummary(alarm.days)})`,
        label: alarm.label,
        delayMs,
        epochMs: targetEpochMs,
        targetEpochMs,
        subtext: `RECURRING (${formatDaysSummary(alarm.days)})`,
      });
    },
    [postToWorker, saveDeadline]
  );

  // Cancel Alarm in Service Worker
  const cancelAlarmBackground = useCallback(
    (alarmId: string) => {
      removeDeadline(alarmId);
      postToWorker({ type: "CANCEL_ALERT", id: alarmId });
    },
    [postToWorker, removeDeadline]
  );

  // Register Service Worker and check permissions on mount
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => {
          if ("Notification" in window) {
            setOsAlertStatus(Notification.permission);
          }
        })
        .catch(() => {
          // SW registration ignored
        });

      // Catch-Up: Check if any background deadlines passed while app was shut
      try {
        const stored = localStorage.getItem("ctu_active_deadlines");
        if (stored) {
          const list: StoredDeadline[] = JSON.parse(stored);
          const now = Date.now();
          const expired = list.find((item) => item.targetEpochMs <= now);
          if (expired) {
            removeDeadline(expired.id);
            setCountdownLabel(expired.label);
            setCrisisTimesUp(true);
            CTUAudio.triggerZeroSound(zeroSound);
          }
        }
      } catch {
        // Storage unreadable
      }
    }
  }, [removeDeadline, zeroSound]);

  // Request Notification Permissions
  const handleRequestOsAlerts = async () => {
    unlockAudio();
    if (typeof window === "undefined" || !("Notification" in window)) {
      alert("Notification API not supported by this browser.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setOsAlertStatus(permission);
      if (permission === "granted") {
        if ("vibrate" in navigator) {
          navigator.vibrate([100, 50, 100]);
        }
        alarms.filter((a) => a.armed).forEach(scheduleAlarmBackground);
        const activeT = timers.find((t) => t.id === activeTimerId && t.running);
        if (activeT) {
          scheduleTimerBackground(activeT.id, activeT.label, activeT.remainingSec);
        }
      }
    } catch {
      // Ignored
    }
  };

  // Hydrate persistence from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const savedTimers = localStorage.getItem("ctu_timers");
      if (savedTimers) setTimers(JSON.parse(savedTimers));

      const savedAlarms = localStorage.getItem("ctu_alarms");
      if (savedAlarms) setAlarms(JSON.parse(savedAlarms));

      const savedVol = localStorage.getItem("ctu_volume");
      if (savedVol !== null) {
        const v = parseFloat(savedVol);
        setMasterVol(v);
        CTUAudio.setMasterVolume(v);
      }

      const savedZeroSound = localStorage.getItem("ctu_zero_sound");
      if (savedZeroSound) setZeroSound(savedZeroSound as ZeroSoundType);

      const savedMusic = localStorage.getItem("ctu_credits_music");
      if (savedMusic !== null) setCreditsMusic(savedMusic === "true");

      const savedMode = localStorage.getItem("ctu_credits_mode");
      if (savedMode === "watercolor" || savedMode === "video") setCreditsMode(savedMode);
    } catch {
      // Storage fallback
    }
  }, []);

  // Persist timers on state change
  useEffect(() => {
    try {
      localStorage.setItem("ctu_timers", JSON.stringify(timers));
    } catch {}
  }, [timers]);

  // Persist alarms on state change
  useEffect(() => {
    try {
      localStorage.setItem("ctu_alarms", JSON.stringify(alarms));
    } catch {}
  }, [alarms]);

  // Handle Master Volume Change
  const handleVolumeChange = (val: number) => {
    setMasterVol(val);
    CTUAudio.setMasterVolume(val);
    try {
      localStorage.setItem("ctu_volume", val.toString());
    } catch {}
  };

  // Credits Music Toggle
  const handleCreditsMusicToggle = () => {
    setCreditsMusic((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("ctu_credits_music", String(next));
      } catch {}
      if (!next) {
        CTUAudio.stopCreditsAudio();
      } else if (creditsOpen) {
        CTUAudio.playCreditsAudio();
      }
      return next;
    });
  };

  // Credits View Mode Toggle
  const handleCreditsModeChange = (mode: "watercolor" | "video") => {
    setCreditsMode(mode);
    try {
      localStorage.setItem("ctu_credits_mode", mode);
    } catch {}
  };

  // 1-Second Master Engine Heartbeat (Clocks, Ticker, Timers, Alarms, Live Lockscreen HUD)
  useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date();
      setNowDate(d);
      setColonVisible((prev) => !prev);

      // Decrement active running timers
      setTimers((prev) =>
        prev.map((t) => {
          if (!t.running) return t;
          const nextRemaining = t.remainingSec - 1;

          // 10-Second Takeover Trigger
          if (nextRemaining === 10) {
            setCountdownLabel(t.label);
            setCountdownRemaining(10);
            setCountdownActive(true);
            CTUAudio.playCountdownSound();
          }

          if (nextRemaining <= 0) {
            cancelTimerBackground(t.id);
            setCountdownActive(false);
            setCrisisTimesUp(true);
            setCountdownLabel(t.label);
            CTUAudio.stopCountdownSound();
            CTUAudio.triggerZeroSound(zeroSound);
            return {
              ...t,
              remainingSec: 0,
              running: false,
              timesUp: true,
              status: "EXPIRED",
            };
          }

          return { ...t, remainingSec: nextRemaining };
        })
      );

      // Evaluate Bangkok time alarms with weekly day checks
      try {
        const bkkFormatter = new Intl.DateTimeFormat("en-US", {
          timeZone: "Asia/Bangkok",
          hour: "numeric",
          minute: "numeric",
          second: "numeric",
          weekday: "short",
          hour12: false,
        });
        const parts = bkkFormatter.formatToParts(d);
        const curH = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
        const curM = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
        const curS = parseInt(parts.find((p) => p.type === "second")?.value || "0", 10);
        const curDayStr = parts.find((p) => p.type === "weekday")?.value || "Sun";
        const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
        const curDay = dayMap[curDayStr] ?? 0;

        alarms.forEach((a) => {
          if (a.armed && curS === 0 && a.hour === curH && a.minute === curM) {
            const allowedDays = a.days && a.days.length > 0 ? a.days : [0, 1, 2, 3, 4, 5, 6];
            if (allowedDays.includes(curDay)) {
              setCountdownLabel(a.label);
              setCountdownRemaining(10);
              setCountdownActive(true);
              CTUAudio.playCountdownSound();
            }
          }
        });
      } catch {
        // Timezone parser fallback
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [alarms, cancelTimerBackground, zeroSound]);

  // Rotate watercolor images in Credits modal every 6 seconds
  useEffect(() => {
    if (!creditsOpen || creditsMode !== "watercolor") return;
    const interval = setInterval(() => {
      setCreditsImageOffset((prev) => (prev + 6) % WATERCOLOR_IMAGES.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [creditsOpen, creditsMode]);

  // Dispatch Live Lockscreen Notification HUD updates whenever running timer or alarm state changes
  useEffect(() => {
    if (typeof window === "undefined" || osAlertStatus !== "granted") return;

    const runningTimer = timers.find((t) => t.id === activeTimerId && t.running);
    const nextArmedAlarm = alarms.find((a) => a.armed);

    if (runningTimer) {
      const h = Math.floor(runningTimer.remainingSec / 3600);
      const m = Math.floor((runningTimer.remainingSec % 3600) / 60);
      const s = runningTimer.remainingSec % 60;
      const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

      postToWorker({
        type: "UPDATE_LOCKSCREEN_HUD",
        title: `[CTU TIMER] ${runningTimer.label}: ${timeStr}`,
        body: `Active Tactical Watch • Next Alarm: ${nextArmedAlarm ? `${String(nextArmedAlarm.hour).padStart(2, "0")}:${String(nextArmedAlarm.minute).padStart(2, "0")} BKK` : "NONE"}`,
      });
    } else if (nextArmedAlarm) {
      postToWorker({
        type: "UPDATE_LOCKSCREEN_HUD",
        title: `[CTU ALARM ARMED] ${nextArmedAlarm.label}`,
        body: `Scheduled: ${String(nextArmedAlarm.hour).padStart(2, "0")}:${String(nextArmedAlarm.minute).padStart(2, "0")} Bangkok Time (${formatDaysSummary(nextArmedAlarm.days)})`,
      });
    } else {
      postToWorker({ type: "CLEAR_LOCKSCREEN_HUD" });
    }
  }, [activeTimerId, alarms, osAlertStatus, postToWorker, timers]);

  // Active Timer Ref & Formatting
  const activeTimer = useMemo(() => {
    return timers.find((t) => t.id === activeTimerId) || timers[0] || INITIAL_TIMERS[0];
  }, [activeTimerId, timers]);

  const formatTime = (totalSec: number) => {
    const s = Math.max(0, totalSec);
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;
    return {
      h: hours.toString().padStart(2, "0"),
      m: minutes.toString().padStart(2, "0"),
      s: seconds.toString().padStart(2, "0"),
    };
  };

  // Bangkok Time Formatter (Primary Ops Zone)
  const bangkokTime = useMemo(() => {
    if (!nowDate) return { time: "--:--:--", date: "CALIBRATING..." };
    try {
      const tf = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Bangkok",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(nowDate);

      const df = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Bangkok",
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
        .format(nowDate)
        .toUpperCase();

      return { time: tf, date: df };
    } catch {
      return { time: "19:38:00", date: "BANGKOK THEATER" };
    }
  }, [nowDate]);

  // Zulu UTC Time
  const zuluTime = useMemo(() => {
    if (!nowDate) return "--:--:--Z";
    try {
      return (
        new Intl.DateTimeFormat("en-US", {
          timeZone: "UTC",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(nowDate) + "Z"
      );
    } catch {
      return "--:--:--Z";
    }
  }, [nowDate]);

  // Sorted Theaters for World Ticker (Ascending Local Time)
  const sortedTheaters = useMemo(() => {
    if (!nowDate) return GLOBAL_THEATERS;
    return [...GLOBAL_THEATERS].sort((a, b) => {
      try {
        const timeA = new Intl.DateTimeFormat("en-US", {
          timeZone: a.zone,
          hour: "numeric",
          minute: "numeric",
          second: "numeric",
          hour12: false,
        }).format(nowDate);

        const timeB = new Intl.DateTimeFormat("en-US", {
          timeZone: b.zone,
          hour: "numeric",
          minute: "numeric",
          second: "numeric",
          hour12: false,
        }).format(nowDate);

        return timeA.localeCompare(timeB);
      } catch {
        return 0;
      }
    });
  }, [nowDate]);

  const getTheaterTime = (zone: string) => {
    if (!nowDate) return "--:--";
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(nowDate);
    } catch {
      return "--:--";
    }
  };

  // Primary Timer Controls
  const handleStartPrimary = () => {
    unlockAudio();
    setTimers((prev) =>
      prev.map((t) => {
        if (t.id === activeTimer.id) {
          scheduleTimerBackground(t.id, t.label, t.remainingSec);
          return { ...t, running: true, timesUp: false, status: "ENGAGED" };
        }
        return t;
      })
    );
  };

  const handlePausePrimary = () => {
    unlockAudio();
    cancelTimerBackground(activeTimer.id);
    setTimers((prev) =>
      prev.map((t) => (t.id === activeTimer.id ? { ...t, running: false, status: "PAUSED" } : t))
    );
  };

  const handleResetPrimary = () => {
    unlockAudio();
    cancelTimerBackground(activeTimer.id);
    setCountdownActive(false);
    setCrisisTimesUp(false);
    CTUAudio.stopCountdownSound();
    setTimers((prev) =>
      prev.map((t) =>
        t.id === activeTimer.id
          ? { ...t, running: false, remainingSec: t.durationSec, timesUp: false, status: "STANDBY" }
          : t
      )
    );
  };

  // Arm Preset into Active Timer
  const handleApplyPreset = (presetSec: number, presetLabel: string) => {
    unlockAudio();
    cancelTimerBackground(activeTimer.id);
    setTimers((prev) =>
      prev.map((t) =>
        t.id === activeTimer.id
          ? {
              ...t,
              durationSec: presetSec,
              remainingSec: presetSec,
              label: presetLabel,
              running: false,
              timesUp: false,
              status: "STANDBY",
            }
          : t
      )
    );
  };

  // Add / Edit Timers
  const handleOpenAddTimer = () => {
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

  const handleEditTimer = (timer: OperationalTimer) => {
    unlockAudio();
    setPickerMode("timer");
    setEditingItemId(timer.id);
    const d = formatTime(timer.durationSec);
    setPickerInitial({
      hours: parseInt(d.h, 10),
      minutes: parseInt(d.m, 10),
      seconds: parseInt(d.s, 10),
      totalSeconds: timer.durationSec,
    });
    setPickerOpen(true);
  };

  const handleDeleteTimer = (id: string) => {
    unlockAudio();
    cancelTimerBackground(id);
    setTimers((prev) => {
      const filtered = prev.filter((t) => t.id !== id);
      if (filtered.length === 0) {
        return [
          {
            id: "timer-1",
            label: "TACTICAL SPRINT",
            durationSec: 25 * 60,
            remainingSec: 25 * 60,
            running: false,
            timesUp: false,
            status: "STANDBY",
          },
        ];
      }
      if (activeTimerId === id) {
        setActiveTimerId(filtered[0].id);
      }
      return filtered;
    });
  };

  // Add / Edit Alarms
  const handleOpenAddAlarm = () => {
    unlockAudio();
    setPickerMode("alarm");
    setEditingItemId(null);
    setPickerInitial({
      hours: 8,
      minutes: 0,
      seconds: 0,
      days: [0, 1, 2, 3, 4, 5, 6],
    });
    setPickerOpen(true);
  };

  const handleEditAlarm = (alarm: OperationalAlarm) => {
    unlockAudio();
    setPickerMode("alarm");
    setEditingItemId(alarm.id);
    setPickerInitial({
      hours: alarm.hour,
      minutes: alarm.minute,
      seconds: 0,
      days: alarm.days && alarm.days.length > 0 ? alarm.days : [0, 1, 2, 3, 4, 5, 6],
    });
    setPickerOpen(true);
  };

  const handleToggleAlarm = (id: string) => {
    unlockAudio();
    setAlarms((prev) =>
      prev.map((a) => {
        if (a.id === id) {
          const nextArmed = !a.armed;
          if (nextArmed) {
            scheduleAlarmBackground({ ...a, armed: true });
          } else {
            cancelAlarmBackground(a.id);
          }
          return { ...a, armed: nextArmed };
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
          label: `MISSION SPRINT ${totalSec >= 60 ? `${Math.round(totalSec / 60)}M` : `${totalSec}S`}`,
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
      const selectedDays = vals.days && vals.days.length > 0 ? vals.days : [0, 1, 2, 3, 4, 5, 6];
      if (editingItemId) {
        setAlarms((prev) =>
          prev.map((a) => {
            if (a.id === editingItemId) {
              const updated = {
                ...a,
                hour: vals.hours,
                minute: vals.minutes,
                days: selectedDays,
                armed: true,
              };
              scheduleAlarmBackground(updated);
              return updated;
            }
            return a;
          })
        );
      } else {
        const newAlarm: OperationalAlarm = {
          id: `alarm-${Date.now()}`,
          label: `OPERATIONAL ALERT ${String(vals.hours).padStart(2, "0")}:${String(vals.minutes).padStart(2, "0")}`,
          hour: vals.hours,
          minute: vals.minutes,
          days: selectedDays,
          armed: true,
        };
        scheduleAlarmBackground(newAlarm);
        setAlarms((prev) => [...prev, newAlarm]);
      }
    }
    setPickerOpen(false);
  };

  // Modals & Panels Controls
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
    if (creditsMusic) {
      CTUAudio.playCreditsAudio();
    }
  };

  const handleCloseCredits = () => {
    setCreditsOpen(false);
    CTUAudio.stopCreditsAudio();
  };

  const handleSnoozeCrisis = () => {
    unlockAudio();
    setCrisisTimesUp(false);
    setCountdownActive(false);
    CTUAudio.stopCountdownSound();
    CTUAudio.stopCrisisAudio();
    // Add 5 minutes to active timer
    setTimers((prev) =>
      prev.map((t) =>
        t.id === activeTimer.id
          ? {
              ...t,
              remainingSec: 5 * 60,
              running: true,
              timesUp: false,
              status: "ENGAGED (SNOOZED)",
            }
          : t
      )
    );
  };

  const handleDisarmCrisis = () => {
    unlockAudio();
    setCrisisTimesUp(false);
    setCountdownActive(false);
    CTUAudio.stopCountdownSound();
    CTUAudio.stopCrisisAudio();
    cancelTimerBackground(activeTimer.id);
    setTimers((prev) =>
      prev.map((t) =>
        t.id === activeTimer.id
          ? { ...t, running: false, remainingSec: t.durationSec, timesUp: false, status: "STANDBY" }
          : t
      )
    );
  };

  // Play test sound for Zero audio select
  const handleZeroSoundChange = (val: ZeroSoundType) => {
    setZeroSound(val);
    try {
      localStorage.setItem("ctu_zero_sound", val);
    } catch {}
    CTUAudio.triggerZeroSound(val);
  };

  const primaryDigits = formatTime(activeTimer.remainingSec);

  return (
    <div
      onClick={unlockAudio}
      className="min-h-screen bg-black text-[#ffcc00] font-mono selection:bg-[#ffcc00] selection:text-black flex flex-col p-2 sm:p-4 select-none"
    >
      {/* Hidden Audio Elements */}
      <audio ref={countdownAudioRef} src="/24 Alarm Countdown.mp3" preload="auto" />
      <audio ref={zeroAudioRef} src="/24 At Zero theme.mp3" preload="auto" />

      {/* Top Banner / Tactical Telemetry Header */}
      <header className="border border-[#ffcc00] p-2.5 sm:p-3 bg-black flex flex-wrap items-center justify-between gap-2 shadow-[0_0_15px_rgba(255,204,0,0.15)] mb-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-2.5 h-2.5 bg-[#ffcc00] animate-pulse rounded-none" />
          <h1 className="text-xs sm:text-sm font-black tracking-widest text-[#ffcc00]">
            CTU TACTICAL OPERATIONAL COMMAND • 24 v74
          </h1>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end text-xs font-bold">
          {/* OS Background Alerts Link Button */}
          <button
            onClick={handleRequestOsAlerts}
            className={`px-2.5 py-1 text-[11px] font-bold border transition-all flex items-center gap-1.5 ${
              osAlertStatus === "granted"
                ? "border-[#ffcc00] bg-[#ffcc00]/20 text-[#ffcc00] shadow-[0_0_10px_rgba(255,204,0,0.3)]"
                : "border-gray-700 bg-black text-gray-400 hover:border-[#ffcc00] hover:text-[#ffcc00]"
            }`}
            title="Enable Service Worker notifications and vibration"
          >
            <span>{osAlertStatus === "granted" ? "● OS ALERTS ARMED" : "○ LINK OS ALERTS"}</span>
          </button>

          <button
            onClick={handleOpenOpening}
            className="border border-[#ffcc00]/80 bg-[#1a1600] px-2.5 py-1 hover:bg-[#ffcc00] hover:text-black transition tracking-wider"
          >
            ▶ 24 OPENING
          </button>
          <button
            onClick={handleOpenCredits}
            className="border border-[#ffcc00]/80 bg-[#1a1600] px-2.5 py-1 hover:bg-[#ffcc00] hover:text-black transition tracking-wider"
          >
            ★ 24 CREDITS
          </button>
        </div>
      </header>

      {/* OS Notification Alert Status Callout (Prominent Banner when not granted) */}
      {osAlertStatus !== "granted" && (
        <div className="border border-[#ffcc00]/60 bg-[#1a1600]/80 p-2.5 mb-3 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-2 text-[#ffcc00]">
            <span className="text-amber-400 font-black">⚠ NOTICE:</span>
            <span>OS background alerts are unlinked. Alarms will not pop up in your notifications when the browser is closed.</span>
          </div>
          <button
            onClick={handleRequestOsAlerts}
            className="bg-[#ffcc00] text-black font-black px-3 py-1 text-xs hover:bg-[#ffe066] transition shadow-[0_0_10px_rgba(255,204,0,0.3)]"
          >
            ENABLE OS NOTIFICATIONS
          </button>
        </div>
      )}

      {/* Moving Global Theater World Clock Ticker */}
      <div className="border-t border-b border-[#ffcc00]/40 bg-black/90 py-1.5 overflow-hidden whitespace-nowrap mb-3 relative">
        <div className="world-ticker-track flex items-center gap-6 sm:gap-8 text-xs tracking-wider">
          {sortedTheaters.concat(sortedTheaters).map((th, i) => (
            <div
              key={`${th.code}-${i}`}
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 border ${
                th.isHome
                  ? "border-[#ffcc00] bg-[#ffcc00]/20 text-[#ffcc00] font-black"
                  : "border-transparent text-[#ffcc00]/80"
              }`}
            >
              <span className="font-mono font-bold tracking-wider">{th.city}:</span>
              <span className="font-mono tabular-nums">{getTheaterTime(th.zone)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main Tactical Grid: Live Clock + Primary Operational Countdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 mb-3 sm:mb-4">
        {/* Bangkok Live Mission Clock (CTU Active Theater) */}
        <section className="border-2 border-[#ffcc00] bg-black p-3 sm:p-4 flex flex-col justify-between shadow-[0_0_25px_rgba(255,204,0,0.2)]">
          <div className="flex items-center justify-between border-b border-[#ffcc00]/40 pb-2">
            <div className="flex items-center gap-2">
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
            <div className="text-4xl sm:text-5xl md:text-6xl font-black text-[#ffcc00] tracking-tight tabular-nums glow text-center">
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
            <div className="text-4xl sm:text-5xl md:text-6xl font-black text-[#ffcc00] tracking-tight tabular-nums glow group-hover:scale-[1.02] transition-transform text-center">
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
                onClick={handleStartPrimary}
                className="flex-1 py-2 sm:py-2.5 bg-[#ffcc00] text-black font-black text-sm tracking-widest hover:bg-[#ffe066] transition shadow-[0_0_15px_rgba(255,204,0,0.4)]"
              >
                EXECUTE
              </button>
            ) : (
              <button
                onClick={handlePausePrimary}
                className="flex-1 py-2 sm:py-2.5 bg-yellow-600 text-black font-black text-sm tracking-widest hover:bg-yellow-500 transition"
              >
                PAUSE
              </button>
            )}
            <button
              onClick={handleResetPrimary}
              className="py-2 sm:py-2.5 px-4 sm:px-6 border border-[#ffcc00] text-[#ffcc00] font-black text-sm tracking-widest hover:bg-[#ffcc00]/20 transition"
            >
              RESET
            </button>
          </div>
        </section>
      </div>

      {/* Quick-Arm Tactical Presets */}
      <div className="border border-[#ffcc00]/40 bg-black p-3 mb-3 sm:mb-4">
        <div className="text-xs font-bold tracking-widest text-[#ffcc00]/80 mb-2">
          ARM AN OPERATION PRESET:
        </div>
        <div className="flex flex-wrap gap-2">
          {CTU_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => handleApplyPreset(p.sec, p.label)}
              className="px-3 py-1.5 border border-[#ffcc00]/40 text-xs font-bold text-[#ffcc00] hover:border-[#ffcc00] hover:bg-[#ffcc00]/10 transition"
            >
              {p.label} ({Math.round(p.sec / 60)}M)
            </button>
          ))}
        </div>
      </div>

      {/* Multi-Timer & Multi-Alarm Queues */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 mb-3 sm:mb-4">
        {/* Multi-Timers Console */}
        <section className="border border-[#ffcc00]/60 bg-black p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between border-b border-[#ffcc00]/30 pb-2">
            <span className="text-xs font-bold tracking-widest text-[#ffcc00]">
              OPERATION QUEUE ({timers.length} ACTIVE)
            </span>
            <button
              onClick={handleOpenAddTimer}
              className="text-[11px] font-bold border border-[#ffcc00] px-2 py-0.5 hover:bg-[#ffcc00]/20 transition"
            >
              + ADD OPERATION
            </button>
          </div>

          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
            {timers.map((t) => {
              const dig = formatTime(t.remainingSec);
              const isFocused = t.id === activeTimerId;
              return (
                <div
                  key={t.id}
                  onClick={() => setActiveTimerId(t.id)}
                  className={`p-2 border cursor-pointer flex items-center justify-between transition ${
                    isFocused
                      ? "border-[#ffcc00] bg-[#ffcc00]/10 shadow-[0_0_10px_rgba(255,204,0,0.2)]"
                      : "border-[#ffcc00]/30 bg-black hover:border-[#ffcc00]/60"
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="text-xs font-bold tracking-wider">{t.label}</span>
                    <span className="text-[10px] text-[#ffcc00]/60">{t.status}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-base font-black tabular-nums tracking-tight">
                      {dig.h}:{dig.m}:{dig.s}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTimer(t.id);
                      }}
                      className="text-xs text-red-500 hover:text-red-400 font-bold px-1"
                      title="Delete operation"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Multi-Alarms Console with Samsung Weekly Day Scheduling */}
        <section className="border border-[#ffcc00]/60 bg-black p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between border-b border-[#ffcc00]/30 pb-2">
            <span className="text-xs font-bold tracking-widest text-[#ffcc00]">
              WEEKLY ALARMS ({alarms.filter((a) => a.armed).length} ARMED)
            </span>
            <button
              onClick={handleOpenAddAlarm}
              className="text-[11px] font-bold border border-[#ffcc00] px-2 py-0.5 hover:bg-[#ffcc00]/20 transition"
            >
              + ADD ALARM
            </button>
          </div>

          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
            {alarms.map((a) => {
              const timeStr = `${a.hour.toString().padStart(2, "0")}:${a.minute.toString().padStart(2, "0")}`;
              const alarmDays = a.days && a.days.length > 0 ? a.days : [0, 1, 2, 3, 4, 5, 6];
              const summary = formatDaysSummary(alarmDays);

              return (
                <div
                  key={a.id}
                  onClick={() => handleEditAlarm(a)}
                  className="p-2.5 border border-[#ffcc00]/30 bg-black flex flex-col gap-2 hover:border-[#ffcc00]/60 transition cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold tracking-wider group-hover:text-[#ffcc00] transition-colors">
                        {a.label}
                      </span>
                      <span className="text-[10px] text-[#ffcc00]/60">
                        BANGKOK (UTC+7) • {summary}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-lg font-black tabular-nums tracking-tight text-[#ffcc00]">
                        {timeStr}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleAlarm(a.id);
                        }}
                        className={`text-[10px] font-bold px-2 py-0.5 border transition-all ${
                          a.armed
                            ? "border-[#ffcc00] text-[#ffcc00] bg-[#ffcc00]/20 shadow-[0_0_8px_rgba(255,204,0,0.3)]"
                            : "border-gray-700 text-gray-500 bg-transparent"
                        }`}
                      >
                        {a.armed ? "ARMED" : "OFF"}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAlarm(a.id);
                        }}
                        className="text-xs text-red-500 hover:text-red-400 font-bold px-1"
                        title="Delete alarm"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Tactile 7-Day Illuminated Mini-Chips (Sunday-first) */}
                  <div className="flex items-center gap-1.5 pt-1 border-t border-[#ffcc00]/10">
                    {WEEK_DAYS.map((d) => {
                      const isArmed = alarmDays.includes(d.day);
                      return (
                        <span
                          key={d.day}
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-mono font-bold transition-all ${
                            isArmed
                              ? "bg-[#ffcc00] text-black shadow-[0_0_6px_rgba(255,204,0,0.5)] font-black"
                              : "border border-gray-800 text-gray-600 bg-black/40"
                          }`}
                        >
                          {d.short}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Surveillance Matrix & Audio Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 mb-4">
        {/* Surveillance Matrix */}
        <section className="border border-[#ffcc00]/40 bg-black p-3">
          <div className="text-xs font-bold tracking-widest text-[#ffcc00] border-b border-[#ffcc00]/30 pb-2 mb-2">
            TACTICAL SURVEILLANCE FEED (SPLIT-SCREEN)
          </div>
          <div className="grid grid-cols-2 gap-2">
            {SURVEILLANCE_CHANNELS.map((ch) => (
              <div key={ch.id} className="border border-[#ffcc00]/30 bg-black/80 p-2 flex flex-col justify-between h-24">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-[#ffcc00]">{ch.id}</span>
                  <span className="text-[9px] text-[#ffcc00]/60">{ch.status}</span>
                </div>
                <div className="text-[11px] font-mono text-[#ffcc00]/80 tracking-tight">
                  {ch.name}
                </div>
                <div className="w-full bg-[#ffcc00]/10 h-1 overflow-hidden">
                  <div className="bg-[#ffcc00] h-full w-2/3 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Audio Calibration & At Zero Selector */}
        <section className="border border-[#ffcc00]/40 bg-black p-3 flex flex-col justify-between">
          <div>
            <div className="text-xs font-bold tracking-widest text-[#ffcc00] border-b border-[#ffcc00]/30 pb-2 mb-3">
              AUDIO TELEMETRY & ZERO SOUND CALIBRATION
            </div>

            {/* Master Volume Slider */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs mb-1">
                <span>MASTER GAIN:</span>
                <span className="font-bold text-[#ffcc00]">{Math.round(masterVol * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={masterVol}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>

            {/* Zero Sound Selector */}
            <div>
              <div className="text-xs font-bold text-[#ffcc00]/80 mb-1.5">
                CRISIS AT ZERO SOUND:
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {(Object.keys(ZERO_SOUND_LABELS) as ZeroSoundType[]).map((st) => (
                  <button
                    key={st}
                    onClick={() => handleZeroSoundChange(st)}
                    className={`p-1.5 text-[11px] font-bold border transition text-left ${
                      zeroSound === st
                        ? "border-[#ffcc00] bg-[#ffcc00]/20 text-[#ffcc00]"
                        : "border-[#ffcc00]/20 text-[#ffcc00]/60 hover:border-[#ffcc00]/50"
                    }`}
                  >
                    {ZERO_SOUND_LABELS[st]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-[#ffcc00]/20 text-[10px] text-[#ffcc00]/50 flex justify-between items-center">
            <span>SOUND HARNESS: CTU SYNTHESIS v74</span>
            <span className="text-[#ffcc00]">READY</span>
          </div>
        </section>
      </div>

      {/* Samsung HH:MM:SS Unified Time Picker Modal */}
      <SamsungTimePicker
        isOpen={pickerOpen}
        mode={pickerMode}
        initialValues={pickerInitial}
        onConfirm={handlePickerConfirm}
        onCancel={() => setPickerOpen(false)}
      />

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
            <div className="relative aspect-video w-full bg-black overflow-hidden flex items-center justify-center">
              <video
                src="/24 Opening.mp4"
                autoPlay
                controls
                playsInline
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* 24 Ending Credits Modal */}
      {creditsOpen && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-2 sm:p-4">
          <div className="w-full max-w-5xl h-[85vh] border-2 border-[#ffcc00] bg-black p-3 relative flex flex-col shadow-[0_0_30px_rgba(255,204,0,0.3)]">
            <div className="flex items-center justify-between border-b border-[#ffcc00] pb-2 mb-2">
              <div className="flex items-center gap-3">
                <span className="text-xs font-black tracking-widest text-[#ffcc00]">
                  24 ENDING CREDITS SEQUENCE
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleCreditsModeChange("watercolor")}
                    className={`text-[10px] px-2 py-0.5 border font-bold ${
                      creditsMode === "watercolor"
                        ? "border-[#ffcc00] bg-[#ffcc00] text-black"
                        : "border-[#ffcc00]/40 text-[#ffcc00]"
                    }`}
                  >
                    WATERCOLORS
                  </button>
                  <button
                    onClick={() => handleCreditsModeChange("video")}
                    className={`text-[10px] px-2 py-0.5 border font-bold ${
                      creditsMode === "video"
                        ? "border-[#ffcc00] bg-[#ffcc00] text-black"
                        : "border-[#ffcc00]/40 text-[#ffcc00]"
                    }`}
                  >
                    ORIGINAL VIDEO
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreditsMusicToggle}
                  className={`text-[10px] px-2 py-0.5 border font-bold ${
                    creditsMusic ? "border-[#ffcc00] text-[#ffcc00]" : "border-gray-600 text-gray-500"
                  }`}
                >
                  MUSIC: {creditsMusic ? "ON" : "OFF"}
                </button>
                <button
                  onClick={handleCloseCredits}
                  className="px-2 py-0.5 border border-[#ffcc00] text-xs font-black hover:bg-[#ffcc00] hover:text-black transition"
                >
                  ✕ CLOSE
                </button>
              </div>
            </div>

            <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center">
              {creditsMode === "video" ? (
                <video
                  src="/24 Closing.mp4"
                  autoPlay
                  controls
                  playsInline
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="relative w-full h-full grid grid-cols-2 sm:grid-cols-3 gap-2 p-2 overflow-hidden">
                  {WATERCOLOR_IMAGES.slice(creditsImageOffset, creditsImageOffset + 6).map((img, idx) => (
                    <div
                      key={idx}
                      className="relative overflow-hidden border border-[#ffcc00]/30 bg-black/60 rounded"
                    >
                      <img
                        src={img}
                        alt="CTU Historical Watercolor"
                        className="w-full h-full object-cover ken watercolor"
                      />
                    </div>
                  ))}
                  {/* Rolling Amber Typography Overlay */}
                  <div className="absolute inset-0 pointer-events-none flex flex-col items-center text-center justify-center font-mono text-[#ffcc00] tracking-widest text-sm font-black space-y-4 glow">
                    <p>COUNTER TERRORIST UNIT</p>
                    <p className="text-xs text-[#ffcc00]/80">LOS ANGELES HEADQUARTERS</p>
                    <p className="text-xs text-[#ffcc00]/60">MISSION CONCLUDED • ARCHIVE LOCKED</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 10-Second Countdown Takeover Overlay */}
      {countdownActive && (
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
            <p className="text-xs text-[#ffcc00]/80 mb-4 tracking-widest">
              FINAL SECONDS BEFORE ZERO. PREPARE FOR IMPACT.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleSnoozeCrisis}
                className="flex-1 py-2 border border-[#ffcc00] text-[#ffcc00] text-xs font-black hover:bg-[#ffcc00]/20"
              >
                SNOOZE 5M
              </button>
              <button
                onClick={handleDisarmCrisis}
                className="flex-1 py-2 bg-[#ffcc00] text-black text-xs font-black hover:bg-[#ffe066]"
              >
                DISARM
              </button>
            </div>
          </div>
        </div>
      )}

      {/* At Zero Crisis Overlay */}
      {crisisTimesUp && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4">
          <div className="text-center max-w-md w-full border-2 border-red-600 bg-black p-6 shadow-[0_0_50px_rgba(239,68,68,0.7)] animate-pulse">
            <div className="text-xs font-black tracking-widest text-red-500 border-b border-red-800 pb-2">
              [CRITICAL EMERGENCY] TIME EXPIRED
            </div>
            <div className="text-4xl sm:text-5xl md:text-6xl font-black text-red-600 tracking-tight my-4">
              00:00:00
            </div>
            <p className="text-xs text-red-400 mb-6 tracking-widest">
              {countdownLabel.toUpperCase() || "OPERATION"} HAS REACHED ZERO.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleSnoozeCrisis}
                className="flex-1 py-2.5 border border-red-500 text-red-500 text-xs font-black hover:bg-red-950/40"
              >
                STAND DOWN (+5M)
              </button>
              <button
                onClick={handleDisarmCrisis}
                className="flex-1 py-2.5 bg-red-600 text-black text-xs font-black hover:bg-red-500"
              >
                ACKNOWLEDGE & DISARM
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
