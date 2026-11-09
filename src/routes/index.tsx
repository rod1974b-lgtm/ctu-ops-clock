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
}

const CTU_PRESETS = [
  { id: "sprint", label: "TACTICAL SPRINT", durationSec: 25 * 60 },
  { id: "interrogate", label: "INTERROGATION", durationSec: 15 * 60 },
  { id: "satellite", label: "SATELLITE PASS", durationSec: 45 * 60 },
  { id: "standdown", label: "STAND-DOWN", durationSec: 5 * 60 },
  { id: "test10", label: "COUNTDOWN (10S)", durationSec: 10 },
];

const INITIAL_TIMERS: OperationalTimer[] = [
  {
    id: "timer-1",
    label: "PRIMARY OPERATION",
    durationSec: 25 * 60,
    remainingSec: 25 * 60,
    running: false,
    timesUp: false,
    status: "READY",
  },
];

const INITIAL_ALARMS: OperationalAlarm[] = [
  {
    id: "alarm-1",
    label: "DAILY BRIEFING",
    hour: 7,
    minute: 0,
    days: [1, 2, 3, 4, 5], // Monday through Friday
    armed: true,
  },
];

const WEEK_DAYS = [
  { short: "S", full: "Sun", day: 0 },
  { short: "M", full: "Mon", day: 1 },
  { short: "T", full: "Tue", day: 2 },
  { short: "W", full: "Wed", day: 3 },
  { short: "T", full: "Thu", day: 4 },
  { short: "F", full: "Fri", day: 5 },
  { short: "S", full: "Sat", day: 6 },
];

function formatDaysSummary(days: number[] = [0, 1, 2, 3, 4, 5, 6]): string {
  if (days.length === 7) return "EVERY DAY";
  if (days.length === 0) return "WEEKLY REPEATING";
  const sorted = [...days].sort((a, b) => a - b);
  const isWeekdays = sorted.length === 5 && [1, 2, 3, 4, 5].every((d) => sorted.includes(d));
  if (isWeekdays) return "WEEKDAYS (MON–FRI)";
  const isWeekends = sorted.length === 2 && sorted.includes(0) && sorted.includes(6);
  if (isWeekends) return "WEEKENDS (SAT–SUN)";
  const names = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return sorted.map((d) => names[d]).join(", ");
}

interface WorldTheater {
  code: string;
  city: string;
  zone: string;
  isHome?: boolean;
}

const WORLD_THEATERS: WorldTheater[] = [
  { code: "LAX", city: "LOS ANGELES (CTU)", zone: "America/Los_Angeles" },
  { code: "DEN", city: "DENVER", zone: "America/Denver" },
  { code: "CHI", city: "CHICAGO", zone: "America/Chicago" },
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
  "/24_accurate_watercolors_final/image_20260922_210416.webp",
  "/24_accurate_watercolors_final/image_20260922_210429.webp",
  "/24_accurate_watercolors_final/image_20260922_210431.webp",
  "/24_accurate_watercolors_final/image_20260922_210433.webp",
  "/24_accurate_watercolors_final/image_20260922_210435.webp",
  "/24_accurate_watercolors_final/image_20260922_210437.webp",
  "/24_accurate_watercolors_final/image_20260922_210439.webp",
  "/24_accurate_watercolors_final/image_20260922_210441.webp",
  "/24_accurate_watercolors_final/image_20260922_210443.webp",
  "/24_accurate_watercolors_final/image_20260922_210445.webp",
  "/24_accurate_watercolors_final/image_20260922_210447.webp",
  "/24_accurate_watercolors_final/image_20260922_210449.webp",
  "/24_accurate_watercolors_final/image_20260922_210451.webp",
  "/24_accurate_watercolors_final/image_20260922_210453.webp",
  "/24_accurate_watercolors_final/image_20260922_210455.webp",
  "/24_accurate_watercolors_final/image_20260922_210457.webp",
  "/24_accurate_watercolors_final/image_20260922_210459.webp",
  "/24_accurate_watercolors_final/image_20260922_210501.webp",
  "/24_accurate_watercolors_final/image_20260922_210503.webp",
  "/24_accurate_watercolors_final/image_20260922_210505.webp",
  "/24_accurate_watercolors_final/image_20260922_210507.webp",
  "/24_accurate_watercolors_final/image_20260922_210509.webp",
  "/24_accurate_watercolors_final/image_20260922_210511.webp",
  "/24_accurate_watercolors_final/image_20260922_210513.webp",
  "/24_accurate_watercolors_final/image_20260922_210515.webp",
  "/24_accurate_watercolors_final/image_20260922_210517.webp",
  "/24_accurate_watercolors_final/image_20260922_210519.webp",
  "/24_accurate_watercolors_final/image_20260922_210521.webp",
  "/24_accurate_watercolors_final/image_20260922_210523.webp",
  "/24_accurate_watercolors_final/image_20260922_210525.webp",
  "/24_accurate_watercolors_final/image_20260922_210527.webp",
];

const SURVEILLANCE_FEEDS = [
  { id: "quad-1", title: "QUAD 1: CTU LAX COM-LINK", state: "SECURE LIVE FEED" },
  { id: "quad-2", title: "QUAD 2: ZULU HQ SATELLITE", state: "ORBIT LOCK 94.2%" },
  { id: "quad-3", title: "QUAD 3: FIELD SQUAD BRAVO", state: "STANDBY RECON" },
  { id: "quad-4", title: "QUAD 4: PERIMETER SENSORS", state: "ACTIVE SCANNING" },
];

function CTUTerminalV74() {
  const [mounted, setMounted] = useState(false);

  // Live Clocks
  const [nowDate, setNowDate] = useState<Date | null>(null);
  const [colonVisible, setColonVisible] = useState(true);

  // User Settings State (Hydrated & Persisted)
  const [zeroSound, setZeroSound] = useState<ZeroSoundType>("voice");
  const [volume, setVolume] = useState(0.85);
  const [creditsMusic, setCreditsMusic] = useState(true);
  const [creditsMode, setCreditsMode] = useState<"watercolor" | "video">("watercolor");

  // Operational Multi-Timers & Multi-Alarms
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
        label,
        delayMs: remainingSec * 1000,
        epochMs: targetEpoch,
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

      saveDeadline({ id: alarm.id, label: alarm.label, targetEpochMs, type: "alarm" });
      postToWorker({
        type: "SCHEDULE_ALERT",
        id: alarm.id,
        label: alarm.label,
        delayMs,
        epochMs: targetEpochMs,
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
      setOsAlertStatus("denied");
    }
  };

  // Restore Persisted Data On Client Hydration
  useEffect(() => {
    setMounted(true);
    setNowDate(new Date());

    try {
      const savedTimers = localStorage.getItem("ctu_timers");
      if (savedTimers) {
        const parsed = JSON.parse(savedTimers);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTimers(parsed);
          setActiveTimerId(parsed[0].id);
        }
      }
    } catch {}

    try {
      const savedAlarms = localStorage.getItem("ctu_alarms");
      if (savedAlarms) {
        const parsed = JSON.parse(savedAlarms);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Ensure every restored alarm has the days array populated
          const normalized = parsed.map((a: OperationalAlarm) => ({
            ...a,
            days: Array.isArray(a.days) && a.days.length > 0 ? a.days : [0, 1, 2, 3, 4, 5, 6],
          }));
          setAlarms(normalized);
        }
      }
    } catch {}

    try {
      const savedSound = localStorage.getItem("ctu_zero_sound");
      if (savedSound && savedSound in ZERO_SOUND_LABELS) {
        setZeroSound(savedSound as ZeroSoundType);
      }
    } catch {}

    try {
      const savedVol = localStorage.getItem("ctu_volume");
      if (savedVol) {
        const num = parseFloat(savedVol);
        if (!isNaN(num)) {
          setVolume(num);
          CTUAudio.setMasterVolume(num);
        }
      }
    } catch {}

    try {
      const savedMusic = localStorage.getItem("ctu_credits_music");
      if (savedMusic !== null) {
        setCreditsMusic(savedMusic === "true");
      }
    } catch {}

    try {
      const savedMode = localStorage.getItem("ctu_credits_mode");
      if (savedMode === "watercolor" || savedMode === "video") {
        setCreditsMode(savedMode);
      }
    } catch {}
  }, []);

  // Persist Timers
  const saveTimers = useCallback((updated: OperationalTimer[]) => {
    setTimers(updated);
    try {
      localStorage.setItem("ctu_timers", JSON.stringify(updated));
    } catch {}
  }, []);

  // Persist Alarms
  const saveAlarms = useCallback((updated: OperationalAlarm[]) => {
    setAlarms(updated);
    try {
      localStorage.setItem("ctu_alarms", JSON.stringify(updated));
    } catch {}
  }, []);

  // Sound selection handler
  const handleZeroSoundChange = (sound: ZeroSoundType) => {
    setZeroSound(sound);
    try {
      localStorage.setItem("ctu_zero_sound", sound);
    } catch {}
  };

  // Master Volume handler
  const handleVolumeChange = (val: number) => {
    setVolume(val);
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

  // 1-Second Master Engine Heartbeat (Clocks, Ticker, Timers, Alarms)
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
        const curWeekdayStr = parts.find((p) => p.type === "weekday")?.value || "Sun";
        const weekdayMap: Record<string, number> = {
          Sun: 0,
          Mon: 1,
          Tue: 2,
          Wed: 3,
          Thu: 4,
          Fri: 5,
          Sat: 6,
        };
        const curDayIndex = weekdayMap[curWeekdayStr] ?? 0;

        if (curS === 0) {
          alarms.forEach((a) => {
            const activeDays = a.days && a.days.length > 0 ? a.days : [0, 1, 2, 3, 4, 5, 6];
            if (a.armed && a.hour === curH && a.minute === curM && activeDays.includes(curDayIndex)) {
              setCountdownLabel(a.label);
              setCrisisTimesUp(true);
              CTUAudio.triggerZeroSound(zeroSound);
            }
          });
        }
      } catch {
        // Fallback local check
        if (d.getSeconds() === 0) {
          const curDay = d.getDay();
          alarms.forEach((a) => {
            const activeDays = a.days && a.days.length > 0 ? a.days : [0, 1, 2, 3, 4, 5, 6];
            if (a.armed && a.hour === d.getHours() && a.minute === d.getMinutes() && activeDays.includes(curDay)) {
              setCountdownLabel(a.label);
              setCrisisTimesUp(true);
              CTUAudio.triggerZeroSound(zeroSound);
            }
          });
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [alarms, zeroSound, cancelTimerBackground]);

  // Rotate Watercolor Images during Credits Roll every 7 seconds
  useEffect(() => {
    if (!creditsOpen || creditsMode !== "watercolor") return;
    const interval = setInterval(() => {
      setCreditsImageOffset((prev) => (prev + 6) % WATERCOLOR_IMAGES.length);
    }, 7000);
    return () => clearInterval(interval);
  }, [creditsOpen, creditsMode]);

  // Synchronize Takeover remaining seconds
  useEffect(() => {
    if (!countdownActive) return;
    const interval = setInterval(() => {
      setCountdownRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [countdownActive]);

  // Format Helper: Seconds to HH, MM, SS
  const formatTime = (totalSec: number) => {
    const s = Math.max(0, Math.floor(totalSec));
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
      return { time: nowDate.toLocaleTimeString(), date: nowDate.toLocaleDateString() };
    }
  }, [nowDate]);

  // Zulu (UTC) Time Formatter
  const zuluTime = useMemo(() => {
    if (!nowDate) return "--:--:-- Z";
    const h = nowDate.getUTCHours().toString().padStart(2, "0");
    const m = nowDate.getUTCMinutes().toString().padStart(2, "0");
    const s = nowDate.getUTCSeconds().toString().padStart(2, "0");
    return `${h}:${m}:${s} Z`;
  }, [nowDate]);

  // Live Sorted World Theaters (Ascending by local time)
  const sortedTheaters = useMemo(() => {
    if (!nowDate) return WORLD_THEATERS;
    return [...WORLD_THEATERS].sort((a, b) => {
      try {
        const timeA = new Date(nowDate.toLocaleString("en-US", { timeZone: a.zone })).getTime();
        const timeB = new Date(nowDate.toLocaleString("en-US", { timeZone: b.zone })).getTime();
        return timeA - timeB;
      } catch {
        return 0;
      }
    });
  }, [nowDate]);

  // Formatter for World Theaters Ticker Items
  const getTheaterTime = (zone: string) => {
    if (!nowDate) return "--:--:--";
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(nowDate);
    } catch {
      return "--:--:--";
    }
  };

  // Primary Active Timer
  const activeTimer = useMemo(() => {
    return timers.find((t) => t.id === activeTimerId) || timers[0] || INITIAL_TIMERS[0];
  }, [timers, activeTimerId]);

  const primaryDigits = useMemo(() => {
    return formatTime(activeTimer.remainingSec);
  }, [activeTimer.remainingSec]);

  // Primary Timer Controls
  const handleStartPrimary = () => {
    unlockAudio();
    CTUAudio.tick();
    const updated = timers.map((t) =>
      t.id === activeTimer.id ? { ...t, running: true, status: "ACTIVE", timesUp: false } : t
    );
    saveTimers(updated);
    scheduleTimerBackground(activeTimer.id, activeTimer.label, activeTimer.remainingSec);
  };

  const handlePausePrimary = () => {
    unlockAudio();
    CTUAudio.chirp();
    cancelTimerBackground(activeTimer.id);
    const updated = timers.map((t) =>
      t.id === activeTimer.id ? { ...t, running: false, status: "PAUSED" } : t
    );
    saveTimers(updated);
  };

  const handleResetPrimary = () => {
    unlockAudio();
    CTUAudio.chirp();
    cancelTimerBackground(activeTimer.id);
    const updated = timers.map((t) =>
      t.id === activeTimer.id
        ? {
            ...t,
            remainingSec: t.durationSec,
            running: false,
            timesUp: false,
            status: "READY",
          }
        : t
    );
    saveTimers(updated);
  };

  // Quick Tactical Presets
  const handleApplyPreset = (durationSec: number, label: string) => {
    unlockAudio();
    CTUAudio.beep();
    cancelTimerBackground(activeTimer.id);
    const updated = timers.map((t) =>
      t.id === activeTimer.id
        ? {
            ...t,
            label,
            durationSec,
            remainingSec: durationSec,
            running: false,
            timesUp: false,
            status: "STANDBY",
          }
        : t
    );
    saveTimers(updated);
  };

  // Multi-Timer Management
  const handleOpenAddTimer = () => {
    unlockAudio();
    setPickerMode("timer");
    setEditingItemId(null);
    setPickerInitial({ hours: 0, minutes: 25, seconds: 0, totalSeconds: 25 * 60 });
    setPickerOpen(true);
  };

  const handleDeleteTimer = (id: string) => {
    unlockAudio();
    cancelTimerBackground(id);
    if (timers.length <= 1) return;
    const nextList = timers.filter((t) => t.id !== id);
    saveTimers(nextList);
    if (activeTimerId === id) {
      setActiveTimerId(nextList[0].id);
    }
  };

  // Multi-Alarm Management
  const handleOpenAddAlarm = () => {
    unlockAudio();
    setPickerMode("alarm");
    setEditingItemId(null);
    setPickerInitial({
      hours: 7,
      minutes: 0,
      seconds: 0,
      days: [1, 2, 3, 4, 5],
      totalSeconds: 7 * 3600,
    });
    setPickerOpen(true);
  };

  const handleToggleAlarm = (id: string) => {
    unlockAudio();
    CTUAudio.tick();
    const updated = alarms.map((a) => (a.id === id ? { ...a, armed: !a.armed } : a));
    saveAlarms(updated);
    const target = updated.find((a) => a.id === id);
    if (target) {
      if (target.armed) {
        scheduleAlarmBackground(target);
      } else {
        cancelAlarmBackground(target.id);
      }
    }
  };

  const handleDeleteAlarm = (id: string) => {
    unlockAudio();
    cancelAlarmBackground(id);
    const nextList = alarms.filter((a) => a.id !== id);
    saveAlarms(nextList);
  };

  // Edit Existing Timer
  const handleEditTimer = (timer: OperationalTimer) => {
    unlockAudio();
    setPickerMode("timer");
    setEditingItemId(timer.id);
    const { h, m, s } = formatTime(timer.durationSec);
    setPickerInitial({
      hours: parseInt(h, 10),
      minutes: parseInt(m, 10),
      seconds: parseInt(s, 10),
      totalSeconds: timer.durationSec,
    });
    setPickerOpen(true);
  };

  // Edit Existing Alarm
  const handleEditAlarm = (alarm: OperationalAlarm) => {
    unlockAudio();
    setPickerMode("alarm");
    setEditingItemId(alarm.id);
    setPickerInitial({
      hours: alarm.hour,
      minutes: alarm.minute,
      seconds: 0,
      days: alarm.days && alarm.days.length > 0 ? alarm.days : [0, 1, 2, 3, 4, 5, 6],
      totalSeconds: alarm.hour * 3600 + alarm.minute * 60,
    });
    setPickerOpen(true);
  };

  // Save Samsung Picker Value (Add or Edit)
  const handleSavePicker = (values: SamsungTimePickerValues) => {
    setPickerOpen(false);
    if (pickerMode === "timer") {
      const durationSec = values.totalSeconds || values.hours * 3600 + values.minutes * 60 + values.seconds;
      if (durationSec <= 0) return;

      if (editingItemId) {
        cancelTimerBackground(editingItemId);
        saveTimers(
          timers.map((t) =>
            t.id === editingItemId
              ? { ...t, durationSec, remainingSec: durationSec, running: false, status: "STANDBY" }
              : t
          )
        );
      } else {
        const newTimer: OperationalTimer = {
          id: `timer-${Date.now()}`,
          label: `OPERATION ${timers.length + 1}`,
          durationSec,
          remainingSec: durationSec,
          running: false,
          timesUp: false,
          status: "READY",
        };
        saveTimers([...timers, newTimer]);
        setActiveTimerId(newTimer.id);
      }
    } else {
      const selectedDays = values.days && values.days.length > 0 ? values.days : [0, 1, 2, 3, 4, 5, 6];

      if (editingItemId) {
        const updatedAlarm = alarms.map((a) =>
          a.id === editingItemId
            ? { ...a, hour: values.hours, minute: values.minutes, days: selectedDays }
            : a
        );
        saveAlarms(updatedAlarm);
        const target = updatedAlarm.find((a) => a.id === editingItemId);
        if (target && target.armed) scheduleAlarmBackground(target);
      } else {
        const newAlarm: OperationalAlarm = {
          id: `alarm-${Date.now()}`,
          label: `ALERT ${alarms.length + 1}`,
          hour: values.hours,
          minute: values.minutes,
          days: selectedDays,
          armed: true,
        };
        saveAlarms([...alarms, newAlarm]);
        scheduleAlarmBackground(newAlarm);
      }
    }
    setEditingItemId(null);
  };

  // Dismiss Crisis Times-Up Screen
  const handleDismissCrisis = () => {
    CTUAudio.stopAll();
    setCrisisTimesUp(false);
    setCountdownActive(false);
    handleResetPrimary();
  };

  // Transmission Video Modal Controls
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

  if (!mounted) {
    return (
      <div className="min-h-screen bg-black text-[#ffcc00] flex items-center justify-center font-mono">
        INITIALIZING CTU TACTICAL MAINFRAME...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-[#ffcc00] font-mono p-2 sm:p-4 md:p-6 flex flex-col gap-4 max-w-7xl mx-auto selection:bg-[#ffcc00] selection:text-black">
      {/* Hidden Audio Elements for Staged Assets */}
      <audio ref={countdownAudioRef} src="/24 Countdown.mp4" preload="auto" />
      <audio ref={zeroAudioRef} src="/24 At Zero theme.mp3" preload="auto" />

      {/* Tactical Top Bar */}
      <header className="border border-[#ffcc00]/60 bg-black p-3 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-[0_0_15px_rgba(255,204,0,0.15)]">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-[#ffcc00] animate-pulse rounded-xs shadow-[0_0_8px_#ffcc00]" />
          <h1 className="text-base sm:text-lg font-black tracking-widest text-[#ffcc00]">
            CTU // TACTICAL OPERATIONS TERMINAL
          </h1>
          <span className="text-[10px] bg-[#ffcc00]/20 text-[#ffcc00] px-2 py-0.5 border border-[#ffcc00]/40 font-bold">
            THREAT CON 2
          </span>
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
            OPENING INTEL
          </button>
          <button
            onClick={handleOpenCredits}
            className="border border-[#ffcc00]/80 bg-[#1a1600] px-2.5 py-1 hover:bg-[#ffcc00] hover:text-black transition tracking-wider"
          >
            ENDING CREDITS
          </button>
        </div>
      </header>

      {/* 20-Theater Chronological World Clock Ticker */}
      <div className="border border-[#ffcc00]/40 bg-black/80 px-2 py-1.5 overflow-hidden relative shadow-[inset_0_0_10px_rgba(255,204,0,0.1)]">
        <div className="absolute left-0 inset-y-0 w-8 bg-gradient-to-r from-black to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 inset-y-0 w-8 bg-gradient-to-l from-black to-transparent z-10 pointer-events-none" />

        <div className="ctu-ticker-track flex items-center gap-6 text-xs whitespace-nowrap">
          {sortedTheaters.map((th) => (
            <div
              key={th.code}
              className={`flex items-center gap-2 px-2 py-0.5 border ${
                th.isHome
                  ? "border-[#ffcc00] bg-[#ffcc00]/20 text-[#ffcc00] font-black shadow-[0_0_10px_rgba(255,204,0,0.3)]"
                  : "border-[#ffcc00]/20 bg-black/50 text-[#ffcc00]/80"
              }`}
            >
              <span className="font-mono font-bold tracking-wider">{th.city}:</span>
              <span className="font-mono tabular-nums">{getTheaterTime(th.zone)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main Tactical Grid: Live Clock + Primary Operational Countdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bangkok Live Mission Clock (CTU Active Theater) */}
        <section className="border-2 border-[#ffcc00] bg-black p-4 flex flex-col justify-between shadow-[0_0_25px_rgba(255,204,0,0.2)]">
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

          <div className="flex flex-col items-center justify-center my-4 py-2">
            <div className="text-6xl sm:text-7xl md:text-8xl font-black text-[#ffcc00] tracking-tighter tabular-nums glow">
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
            <div className="mt-2 text-xs tracking-widest text-[#ffcc00]/70 font-bold">
              {bangkokTime.date}
            </div>
          </div>

          <div className="border-t border-[#ffcc00]/30 pt-2 flex items-center justify-between text-[11px] text-[#ffcc00]/60">
            <span>SYNCHRONIZED WITH CTU SATELLITE NETWORK</span>
            <span className="text-[#ffcc00] font-bold">SIGNAL LOCK: 100%</span>
          </div>
        </section>

        {/* Primary Operational Countdown Console */}
        <section className="border-2 border-[#ffcc00] bg-black p-4 flex flex-col justify-between shadow-[0_0_25px_rgba(255,204,0,0.2)]">
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

          {/* Primary Big Digits */}
          <div
            onClick={() => handleEditTimer(activeTimer)}
            className="flex flex-col items-center justify-center my-4 py-2 cursor-pointer group"
            title="Tap to adjust operational duration"
          >
            <div className="text-6xl sm:text-7xl md:text-8xl font-black text-[#ffcc00] tracking-tighter tabular-nums glow group-hover:scale-[1.02] transition-transform">
              {primaryDigits.h}:{primaryDigits.m}:{primaryDigits.s}
            </div>
            <div className="mt-2 text-[10px] tracking-widest text-[#ffcc00]/60 group-hover:text-[#ffcc00] transition">
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
                EXECUTE OPERATION
              </button>
            ) : (
              <button
                onClick={handlePausePrimary}
                className="flex-1 py-2 sm:py-2.5 border-2 border-[#ffcc00] bg-black text-[#ffcc00] font-black text-sm tracking-widest hover:bg-[#ffcc00]/20 transition"
              >
                HOLD / PAUSE
              </button>
            )}

            <button
              onClick={handleResetPrimary}
              className="px-4 py-2 sm:py-2.5 border border-[#ffcc00]/60 text-[#ffcc00]/80 font-bold text-xs tracking-widest hover:bg-red-900/30 hover:border-red-500 hover:text-red-400 transition"
            >
              RESET
            </button>
          </div>
        </section>
      </div>

      {/* Quick-Arm Tactical Presets */}
      <section className="border border-[#ffcc00]/50 bg-black p-3">
        <div className="text-[11px] font-bold tracking-widest text-[#ffcc00]/70 mb-2">
          ARM IMMEDIATE TACTICAL PROTOCOL:
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {CTU_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => handleApplyPreset(p.durationSec, p.label)}
              className="py-1.5 px-2 border border-[#ffcc00]/40 bg-black/60 hover:bg-[#ffcc00] hover:text-black font-bold text-xs tracking-wider transition truncate"
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      {/* Multi-Timer & Multi-Alarm Queues */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                              ? "bg-[#ffcc00] text-black shadow-[0_0_6px_rgba(255,204,0,0.4)]"
                              : "border border-[#ffcc00]/20 text-[#ffcc00]/30 bg-black/40"
                          }`}
                          title={`${d.full}: ${isArmed ? "Armed" : "Off"}`}
                        >
                          {d.short}
                        </span>
                      );
                    })}
                    <span className="ml-auto text-[9px] font-mono text-[#ffcc00]/50 tracking-wider">
                      {a.armed ? "REPEATING WEEKLY" : "STANDBY"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Surveillance Feed Matrix (4 Split Quadrants) */}
      <section className="border border-[#ffcc00]/50 bg-black p-3">
        <div className="flex items-center justify-between border-b border-[#ffcc00]/30 pb-2 mb-2">
          <span className="text-xs font-bold tracking-widest text-[#ffcc00]">
            TACTICAL SURVEILLANCE MATRIX // 4-QUADRANT SATELLITE TELEMETRY
          </span>
          <span className="text-[10px] text-green-500 font-bold animate-pulse">● ENCRYPTED LINK</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {SURVEILLANCE_FEEDS.map((feed) => (
            <div
              key={feed.id}
              className="border border-[#ffcc00]/30 bg-black/80 p-2 flex flex-col justify-between h-24 relative overflow-hidden"
            >
              <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#ffcc00] animate-ping" />
              <div className="text-[10px] font-bold text-[#ffcc00]/90">{feed.title}</div>
              <div className="flex flex-col gap-0.5">
                <div className="text-[9px] text-[#ffcc00]/60 font-mono">{feed.state}</div>
                <div className="text-[8px] text-gray-500 font-mono">LAT: 13.7563° N / LON: 100.5018° E</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Audio Matrix & Tactical Settings */}
      <footer className="border border-[#ffcc00]/40 bg-black p-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[#ffcc00]/70 font-bold">AT ZERO SOUND:</span>
          <select
            value={zeroSound}
            onChange={(e) => handleZeroSoundChange(e.target.value as ZeroSoundType)}
            className="bg-black border border-[#ffcc00] text-[#ffcc00] font-bold px-2 py-1 text-xs focus:outline-none"
          >
            {Object.entries(ZERO_SOUND_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              unlockAudio();
              CTUAudio.triggerZeroSound(zeroSound);
            }}
            className="border border-[#ffcc00] px-2 py-1 text-[11px] font-bold hover:bg-[#ffcc00]/20 transition"
          >
            TEST ZERO
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[#ffcc00]/70 font-bold">MASTER VOLUME:</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
            className="w-24 sm:w-32 accent-[#ffcc00]"
          />
          <span className="font-bold tabular-nums">{Math.round(volume * 100)}%</span>
        </div>
      </footer>

      {/* Samsung Galaxy One UI-Style Drum Time & Weekly Day Picker Modal */}
      {pickerOpen && (
        <SamsungTimePicker
          mode={pickerMode}
          initialHours={pickerInitial.hours}
          initialMinutes={pickerInitial.minutes}
          initialSeconds={pickerInitial.seconds}
          initialDays={pickerInitial.days}
          onSave={handleSavePicker}
          onCancel={() => {
            setPickerOpen(false);
            setEditingItemId(null);
          }}
        />
      )}

      {/* Fullscreen Final 10-Second Takeover Overlay */}
      {countdownActive && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4">
          <div className="border-4 border-[#ffcc00] bg-black p-8 md:p-12 text-center max-w-xl w-full shadow-[0_0_50px_rgba(255,204,0,0.5)]">
            <div className="text-red-500 font-black tracking-widest text-sm md:text-lg mb-2 animate-pulse">
              CRITICAL TIMEOUT ESCALATION // {countdownLabel}
            </div>
            <div
              className={`text-7xl sm:text-8xl md:text-9xl font-black tabular-nums my-4 tracking-tighter ${
                countdownRemaining <= 3
                  ? "text-red-600 animate-bounce glow"
                  : "text-[#ffcc00] animate-pulse glow"
              }`}
            >
              00:00:{countdownRemaining.toString().padStart(2, "0")}
            </div>
            <div className="text-xs text-[#ffcc00]/70 tracking-widest mb-6">
              REACHING ZERO IMPACT // MULTI-TIER AUDIO MATRIX ENGAGED
            </div>
            <button
              onClick={() => {
                CTUAudio.stopAll();
                setCountdownActive(false);
              }}
              className="px-8 py-3 bg-[#ffcc00] text-black font-black tracking-widest text-base hover:bg-white transition"
            >
              DISARM TAKEOVER
            </button>
          </div>
        </div>
      )}

      {/* Fullscreen Times-Up / Crisis Impact Dialog */}
      {crisisTimesUp && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4">
          <div className="border-4 border-red-600 bg-black p-8 md:p-12 text-center max-w-xl w-full shadow-[0_0_60px_rgba(255,0,0,0.6)] animate-pulse">
            <div className="text-red-500 font-black text-xl tracking-widest mb-2">
              [CRISIS PROTOCOL ACTIVATED]
            </div>
            <div className="text-6xl sm:text-7xl md:text-8xl font-black text-red-600 tracking-tight my-4">
              00:00:00
            </div>
            <div className="text-sm font-bold text-[#ffcc00] mb-2 tracking-wider">
              {countdownLabel || "OPERATIONAL MISSION"} REACHED ZERO
            </div>
            <div className="text-xs text-gray-400 mb-6">
              ALL SURVEILLANCE PROTOCOLS STANDING BY FOR DISARM
            </div>
            <button
              onClick={handleDismissCrisis}
              className="px-8 py-3 bg-red-600 text-white font-black tracking-widest hover:bg-red-500 transition text-sm"
            >
              ACKNOWLEDGE & STAND DOWN
            </button>
          </div>
        </div>
      )}

      {/* CTU Opening Intel Video Modal */}
      {openingOpen && (
        <div
          onClick={handleCloseOpening}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="border-2 border-[#ffcc00] bg-black p-4 max-w-3xl w-full shadow-[0_0_40px_rgba(255,204,0,0.4)] flex flex-col gap-3"
          >
            <div className="flex items-center justify-between border-b border-[#ffcc00]/40 pb-2">
              <span className="text-xs font-bold tracking-widest text-[#ffcc00]">
                TRANSMISSION FEED: CTU OPERATIONS INTEL
              </span>
              <button
                onClick={handleCloseOpening}
                className="text-red-500 font-black hover:text-red-400 text-sm"
              >
                ✕ CLOSE
              </button>
            </div>
            <div className="w-full aspect-video bg-black flex items-center justify-center overflow-hidden border border-[#ffcc00]/30">
              <video
                src="/24 Opening.mp4"
                controls
                autoPlay
                playsInline
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* 24 Ending Credits Modal */}
      {creditsOpen && (
        <div
          onClick={handleCloseCredits}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="border-2 border-[#ffcc00] bg-black p-4 max-w-4xl w-full max-h-[90vh] flex flex-col gap-3 shadow-[0_0_50px_rgba(255,204,0,0.4)]"
          >
            <div className="flex items-center justify-between border-b border-[#ffcc00]/40 pb-2">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold tracking-widest text-[#ffcc00]">
                  CTU TACTICAL ARCHIVE // DEPLOYMENT CREDITS
                </span>
                <button
                  onClick={handleCreditsMusicToggle}
                  className={`text-[10px] font-bold px-2 py-0.5 border transition ${
                    creditsMusic
                      ? "border-[#ffcc00] bg-[#ffcc00]/20 text-[#ffcc00]"
                      : "border-gray-700 text-gray-500"
                  }`}
                >
                  {creditsMusic ? "♪ SCORE: ON" : "♪ SCORE: OFF"}
                </button>
                <button
                  onClick={() => handleCreditsModeChange(creditsMode === "watercolor" ? "video" : "watercolor")}
                  className="text-[10px] font-bold px-2 py-0.5 border border-[#ffcc00]/60 hover:bg-[#ffcc00]/20 transition"
                >
                  VIEW: {creditsMode === "watercolor" ? "WATERCOLOR GRID" : "VIDEO FEED"}
                </button>
              </div>
              <button
                onClick={handleCloseCredits}
                className="text-red-500 font-black hover:text-red-400 text-sm"
              >
                ✕ CLOSE
              </button>
            </div>

            {creditsMode === "video" ? (
              <div className="w-full aspect-video bg-black flex items-center justify-center overflow-hidden border border-[#ffcc00]/30">
                <video
                  src="/24 Closing.mp4"
                  controls
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 p-2 bg-black/60 overflow-hidden">
                {WATERCOLOR_IMAGES.slice(creditsImageOffset, creditsImageOffset + 6).map((src, idx) => (
                  <div
                    key={idx}
                    className="aspect-video border border-[#ffcc00]/30 overflow-hidden bg-black flex items-center justify-center relative"
                  >
                    <img
                      src={src}
                      alt={`Watercolor Tactical Scene ${idx + 1}`}
                      className="w-full h-full object-cover animate-pulse transition-opacity duration-1000"
                    />
                    <div className="absolute bottom-1 left-1 bg-black/80 px-1 py-0.5 text-[8px] text-[#ffcc00] font-mono">
                      ARCHIVE SCENE {creditsImageOffset + idx + 1}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
