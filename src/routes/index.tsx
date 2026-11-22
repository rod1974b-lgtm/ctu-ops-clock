// src/routes/index.tsx — FULL DROP-IN REPLACEMENT FILE (CHRONOLOGICAL WORLDWIDE TICKER + TACTICAL OPS TERMINAL)
import React, { useState, useEffect, useRef, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SamsungTimePicker, type SamsungTimePickerValues } from "@/components/samsung-time-picker";
import { CTUAudio, ZeroSoundType } from "@/lib/ctu-audio";
import {
  initBackgroundAlerts,
  scheduleLocalAlert,
  cancelLocalAlert,
  updateLockscreenHUD,
  clearLockscreenHUD,
  getNotificationPermissionStatus,
  requestNotificationPermission,
} from "@/lib/background-alerts";
import {
  isMedianApp,
  requestMedianOneSignalPermission,
  isMedianAlertsArmed,
  sendMedianTestAlert,
  keepScreenOnMedian,
} from "@/lib/median-bridge";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CTU Tactical Ops Terminal // 24 Mission Clocks & Timers" },
      { name: "description", content: "24 CTU Multi-Timer, Alarm, Chronological World Ticker & Surveillance Operations Terminal." },
      { property: "og:title", content: "CTU Tactical Ops Terminal // 24" },
      { property: "og:description", content: "Tactical mission timers, alarms, and surveillance HUD." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CTUTacticalOpsTerminal,
});

export type TimerStatus = "IDLE" | "RUNNING" | "PAUSED" | "EXPIRED";

export interface TimerItem {
  id: string;
  label: string;
  durationSec: number;
  remainingSec: number;
  status: TimerStatus;
  targetEpochMs?: number;
  zeroSound: ZeroSoundType;
}

export interface AlarmItem {
  id: string;
  label: string;
  timeStr: string; // HH:mm
  days: number[]; // 0=Sun..6=Sat
  enabled: boolean;
  zeroSound: ZeroSoundType;
}

// World Ticker Stations ordered chronologically from West to East (UTC-10 to UTC+12)
const WORLD_STATIONS = [
  { city: "HONOLULU", code: "HNL", tz: "Pacific/Honolulu", offset: "UTC-10" },
  { city: "ANCHORAGE", code: "ANC", tz: "America/Anchorage", offset: "UTC-9" },
  { city: "LOS ANGELES", code: "LAX", tz: "America/Los_Angeles", offset: "UTC-8" },
  { city: "DENVER", code: "DEN", tz: "America/Denver", offset: "UTC-7" },
  { city: "CHICAGO", code: "ORD", tz: "America/Chicago", offset: "UTC-6" },
  { city: "WASHINGTON DC", code: "IAD", tz: "America/New_York", offset: "UTC-5" },
  { city: "LONDON // CTU", code: "LON", tz: "Europe/London", offset: "UTC+0" },
  { city: "PARIS", code: "PAR", tz: "Europe/Paris", offset: "UTC+1" },
  { city: "CAIRO", code: "CAI", tz: "Africa/Cairo", offset: "UTC+2" },
  { city: "MOSCOW", code: "SVO", tz: "Europe/Moscow", offset: "UTC+3" },
  { city: "DUBAI", code: "DXB", tz: "Asia/Dubai", offset: "UTC+4" },
  { city: "BANGKOK // FIELD", code: "BKK", tz: "Asia/Bangkok", offset: "UTC+7" },
  { city: "SINGAPORE", code: "SIN", tz: "Asia/Singapore", offset: "UTC+8" },
  { city: "TOKYO", code: "TYO", tz: "Asia/Tokyo", offset: "UTC+9" },
  { city: "SYDNEY", code: "SYD", tz: "Australia/Sydney", offset: "UTC+10" },
  { city: "AUCKLAND", code: "AKL", tz: "Pacific/Auckland", offset: "UTC+12" },
];

const INITIAL_TIMERS: TimerItem[] = [
  { id: "timer-1", label: "TAC SPRINT", durationSec: 1500, remainingSec: 1500, status: "IDLE", zeroSound: "theme" },
  { id: "timer-2", label: "BREACH PROTOCOL", durationSec: 180, remainingSec: 180, status: "IDLE", zeroSound: "ctu_beep" },
  { id: "timer-3", label: "SERVER PURGE", durationSec: 420, remainingSec: 420, status: "IDLE", zeroSound: "alarm" },
  { id: "timer-4", label: "INTERROGATION", durationSec: 900, remainingSec: 900, status: "IDLE", zeroSound: "cisco_ring" },
  { id: "timer-5", label: "EXTRACTION WIN", durationSec: 1200, remainingSec: 1200, status: "IDLE", zeroSound: "theme" },
  { id: "timer-6", label: "SAT RECON PASS", durationSec: 2700, remainingSec: 2700, status: "IDLE", zeroSound: "theme" },
];

const INITIAL_ALARMS: AlarmItem[] = [
  { id: "alarm-1", label: "FIELD SHIFT A", timeStr: "06:00", days: [1, 2, 3, 4, 5], enabled: true, zeroSound: "cisco_ring" },
  { id: "alarm-2", label: "ZULU BRIEF", timeStr: "14:00", days: [1, 2, 3, 4, 5], enabled: false, zeroSound: "theme" },
  { id: "alarm-3", label: "COMMS SYNC", timeStr: "22:00", days: [0, 1, 2, 3, 4, 5, 6], enabled: true, zeroSound: "ctu_beep" },
  { id: "alarm-4", label: "SATELLITE DOWNLINK", timeStr: "03:30", days: [1, 3, 5], enabled: true, zeroSound: "theme" },
  { id: "alarm-5", label: "COMMAND HANDOFF", timeStr: "08:00", days: [0, 1, 2, 3, 4, 5, 6], enabled: true, zeroSound: "cisco_ring" },
  { id: "alarm-6", label: "DEFCON SWEEP", timeStr: "18:45", days: [2, 4, 6], enabled: false, zeroSound: "alarm" },
];

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function CTUTacticalOpsTerminal() {
  const [timers, setTimers] = useState<TimerItem[]>(INITIAL_TIMERS);
  const [alarms, setAlarms] = useState<AlarmItem[]>(INITIAL_ALARMS);
  const [focusedTimerId, setFocusedTimerId] = useState<string>("timer-1");

  // Clocks
  const [bangkokTime, setBangkokTime] = useState<string>("00:00:00");
  const [zuluTime, setZuluTime] = useState<string>("00:00:00");
  const [worldTimes, setWorldTimes] = useState<Record<string, string>>({});
  const [colonVisible, setColonVisible] = useState<boolean>(true);

  // Audio & Silent Clock Tribute
  const [audioUnlocked, setAudioUnlocked] = useState<boolean>(false);
  const [silentClock, setSilentClock] = useState<boolean>(false);

  // Wake Lock & MediaSession
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);
  const wakeLockSentinel = useRef<WakeLockSentinel | null>(null);

  // Environment & Permissions
  const [isMedianEnv, setIsMedianEnv] = useState<boolean>(false);
  const [osAlertsArmed, setOsAlertsArmed] = useState<boolean>(false);
  const [permissionNotice, setPermissionNotice] = useState<string | null>(null);

  // Floating Tactical PiP HUD State
  const [floatingPipOpen, setFloatingPipOpen] = useState<boolean>(false);
  const [floatingPipMode, setFloatingPipMode] = useState<"TIMERS" | "ALARMS">("TIMERS");
  const [floatingPipMinimized, setFloatingPipMinimized] = useState<boolean>(false);
  const [pipPosition, setPipPosition] = useState<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ clientX: number; clientY: number; posX: number; posY: number }>({ clientX: 0, clientY: 0, posX: 0, posY: 0 });

  // Samsung Picker Modal State
  const [pickerOpen, setPickerOpen] = useState<boolean>(false);
  const [pickerTargetType, setPickerTargetType] = useState<"TIMER" | "ALARM">("TIMER");
  const [pickerTargetId, setPickerTargetId] = useState<string | null>(null);
  const [pickerInitialValues, setPickerInitialValues] = useState<SamsungTimePickerValues>({
    hours: 0,
    minutes: 25,
    seconds: 0,
  });

  // Full Screen Takeover Modal
  const [takeoverOpen, setTakeoverOpen] = useState<boolean>(false);
  const [takeoverRemainingSec, setTakeoverRemainingSec] = useState<number>(10);
  const [takeoverSourceLabel, setTakeoverSourceLabel] = useState<string>("TACTICAL COUNTDOWN");

  // Ringing Banner
  const [ringingAlert, setRingingAlert] = useState<{ id: string; label: string; sound: ZeroSoundType } | null>(null);

  // Initialize environment, clocks, and background alerts
  useEffect(() => {
    initBackgroundAlerts().catch(() => {});
    const median = isMedianApp();
    setIsMedianEnv(median);
    if (median) {
      setOsAlertsArmed(isMedianAlertsArmed());
    } else {
      setOsAlertsArmed(getNotificationPermissionStatus() === "granted");
    }

    const clockInterval = setInterval(() => {
      const now = new Date();
      setColonVisible((prev) => !prev);

      const bkk = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Bangkok",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(now);
      setBangkokTime(bkk);

      const zulu = new Intl.DateTimeFormat("en-GB", {
        timeZone: "UTC",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(now);
      setZuluTime(zulu);

      // Compute all worldwide stations in chronological order
      const newWorldTimes: Record<string, string> = {};
      WORLD_STATIONS.forEach((st) => {
        try {
          newWorldTimes[st.code] = new Intl.DateTimeFormat("en-GB", {
            timeZone: st.tz,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          }).format(now);
        } catch {
          newWorldTimes[st.code] = "--:--:--";
        }
      });
      setWorldTimes(newWorldTimes);
    }, 1000);

    return () => clearInterval(clockInterval);
  }, []);

  // MediaSession API lock-screen updates
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    const running = timers.filter((t) => t.status === "RUNNING");
    if (running.length > 0) {
      const closest = [...running].sort((a, b) => a.remainingSec - b.remainingSec)[0];
      if (closest) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: `[T-${formatTime(closest.remainingSec)}] ${closest.label}`,
          artist: "CTU Tactical Terminal // 24",
          album: `${running.length} Timers Active`,
        });
        navigator.mediaSession.playbackState = "playing";
      }
    } else {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: "CTU Ops Terminal // Standby",
        artist: "Bangkok / Zulu Synchronized",
        album: "CTU 24",
      });
      navigator.mediaSession.playbackState = "none";
    }
  }, [timers]);

  // Open Floating Tactical PiP HUD
  const openFloatingPip = (mode: "TIMERS" | "ALARMS") => {
    setFloatingPipMode(mode);
    setFloatingPipOpen(true);
    setFloatingPipMinimized(false);

    CTUAudio.unlockAudio()
      .then(() => setAudioUnlocked(true))
      .catch(() => {});
  };

  // Dragging handlers for Touch and Mouse
  const handleDragStart = (clientX: number, clientY: number) => {
    isDraggingRef.current = true;
    const currentX = pipPosition?.x ?? (typeof window !== "undefined" ? Math.max(10, window.innerWidth - 370) : 10);
    const currentY = pipPosition?.y ?? (typeof window !== "undefined" ? Math.max(80, window.innerHeight - 380) : 80);

    dragStartRef.current = { clientX, clientY, posX: currentX, posY: currentY };
  };

  const handleDragMove = useCallback((clientX: number, clientY: number) => {
    if (!isDraggingRef.current) return;
    const deltaX = clientX - dragStartRef.current.clientX;
    const deltaY = clientY - dragStartRef.current.clientY;

    const newX = Math.max(5, Math.min(window.innerWidth - 80, dragStartRef.current.posX + deltaX));
    const newY = Math.max(50, Math.min(window.innerHeight - 80, dragStartRef.current.posY + deltaY));

    setPipPosition({ x: newX, y: newY });
  }, []);

  useEffect(() => {
    const onTouchMove = (e: TouchEvent) => {
      if (isDraggingRef.current && e.touches[0]) {
        handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const onMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current) {
        handleDragMove(e.clientX, e.clientY);
      }
    };
    const onEnd = () => {
      isDraggingRef.current = false;
    };

    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onEnd);

    return () => {
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onEnd);
    };
  }, [handleDragMove]);

  // Main countdown engine tick (timers & alarms)
  useEffect(() => {
    const interval = setInterval(() => {
      const nowMs = Date.now();

      // Check Timers
      setTimers((prev) =>
        prev.map((t) => {
          if (t.status !== "RUNNING" || !t.targetEpochMs) return t;

          const remaining = Math.max(0, Math.ceil((t.targetEpochMs - nowMs) / 1000));

          if (remaining <= 10 && remaining > 0) {
            if (!takeoverOpen) {
              setTakeoverOpen(true);
              setTakeoverSourceLabel(`TIMER: ${t.label}`);
              setTakeoverRemainingSec(remaining);
              CTUAudio.startCountdownTakeoverAudio(remaining);
            } else {
              setTakeoverRemainingSec(remaining);
            }
          }

          if (remaining === 0) {
            CTUAudio.stopCountdownAudio();
            setTakeoverOpen(false);
            setRingingAlert({ id: t.id, label: t.label, sound: t.zeroSound });
            CTUAudio.triggerZeroSound(t.zeroSound);
            clearLockscreenHUD().catch(() => {});

            return {
              ...t,
              remainingSec: 0,
              status: "EXPIRED",
              targetEpochMs: undefined,
            };
          }

          return { ...t, remainingSec: remaining };
        })
      );

      // Check Alarms
      const now = new Date();
      const currentDay = now.getDay();
      const currentHHMM = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
      const currentSec = now.getSeconds();

      alarms.forEach((a) => {
        if (!a.enabled) return;
        if (!a.days.includes(currentDay)) return;

        if (a.timeStr === currentHHMM && currentSec === 0) {
          setRingingAlert({ id: a.id, label: a.label, sound: a.zeroSound });
          CTUAudio.triggerZeroSound(a.zeroSound);
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [takeoverOpen, alarms]);

  // Handlers for Timers
  const startTimer = (id: string) => {
    CTUAudio.unlockAudio().catch(() => {});
    setAudioUnlocked(true);
    CTUAudio.playChirp();

    setTimers((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const targetEpoch = Date.now() + t.remainingSec * 1000;
        scheduleLocalAlert(t.id, t.label, targetEpoch).catch(() => {});
        updateLockscreenHUD(t.label, t.remainingSec).catch(() => {});
        return {
          ...t,
          status: "RUNNING",
          targetEpochMs: targetEpoch,
        };
      })
    );
  };

  const pauseTimer = (id: string) => {
    CTUAudio.playChirp();
    cancelLocalAlert(id).catch(() => {});
    setTimers((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        return {
          ...t,
          status: "PAUSED",
          targetEpochMs: undefined,
        };
      })
    );
  };

  const resetTimer = (id: string) => {
    CTUAudio.playChirp();
    cancelLocalAlert(id).catch(() => {});
    setTimers((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        return {
          ...t,
          remainingSec: t.durationSec,
          status: "IDLE",
          targetEpochMs: undefined,
        };
      })
    );
  };

  const handleOpenPickerForTimer = (id: string) => {
    const t = timers.find((item) => item.id === id);
    if (!t) return;
    setPickerTargetType("TIMER");
    setPickerTargetId(id);
    const hrs = Math.floor(t.durationSec / 3600);
    const mins = Math.floor((t.durationSec % 3600) / 60);
    const secs = t.durationSec % 60;
    setPickerInitialValues({ hours: hrs, minutes: mins, seconds: secs });
    setPickerOpen(true);
  };

  const handleOpenPickerForAlarm = (id: string) => {
    const a = alarms.find((item) => item.id === id);
    if (!a) return;
    setPickerTargetType("ALARM");
    setPickerTargetId(id);
    const [hrs, mins] = a.timeStr.split(":").map((v) => parseInt(v, 10) || 0);
    setPickerInitialValues({ hours: hrs ?? 0, minutes: mins ?? 0, seconds: 0 });
    setPickerOpen(true);
  };

  const handlePickerConfirm = (values: SamsungTimePickerValues) => {
    if (pickerTargetType === "TIMER" && pickerTargetId) {
      const totalSec = (values.hours || 0) * 3600 + (values.minutes || 0) * 60 + (values.seconds || 0);
      const safeDuration = Math.max(1, totalSec);
      setTimers((prev) =>
        prev.map((t) => {
          if (t.id !== pickerTargetId) return t;
          return {
            ...t,
            durationSec: safeDuration,
            remainingSec: safeDuration,
            status: "IDLE",
            targetEpochMs: undefined,
          };
        })
      );
    } else if (pickerTargetType === "ALARM" && pickerTargetId) {
      const hh = (values.hours || 0).toString().padStart(2, "0");
      const mm = (values.minutes || 0).toString().padStart(2, "0");
      setAlarms((prev) =>
        prev.map((a) => {
          if (a.id !== pickerTargetId) return a;
          return { ...a, timeStr: `${hh}:${mm}` };
        })
      );
    }
    setPickerOpen(false);
  };

  // Toggle Wake Lock & Hardware Keep Awake
  const toggleWakeLock = async () => {
    const willActive = !wakeLockActive;
    keepScreenOnMedian(willActive);

    if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
      if (wakeLockActive && wakeLockSentinel.current) {
        try {
          await wakeLockSentinel.current.release();
          wakeLockSentinel.current = null;
          setWakeLockActive(false);
        } catch {}
      } else {
        try {
          wakeLockSentinel.current = await navigator.wakeLock.request("screen");
          setWakeLockActive(true);
          wakeLockSentinel.current.addEventListener("release", () => {
            setWakeLockActive(false);
          });
        } catch (err) {
          console.warn("[CTU] Screen wake lock error:", err);
          setWakeLockActive(willActive);
        }
      }
    } else {
      setWakeLockActive(willActive);
    }
  };

  // Toggle Silent Clock Tribute Mode
  const toggleSilentClock = () => {
    const nextVal = !silentClock;
    setSilentClock(nextVal);
    CTUAudio.shared.setSilentClock(nextVal);
    CTUAudio.playChirp();
  };

  // OS Alerts Permission Request
  const handleLinkOsAlerts = async () => {
    CTUAudio.playChirp();
    if (isMedianEnv) {
      const granted = await requestMedianOneSignalPermission();
      if (granted) {
        setOsAlertsArmed(true);
        setPermissionNotice("OS Alerts armed via Median Android Bridge.");
      } else {
        setPermissionNotice(
          "Notification alerts are blocked. To unblock in the app: 1. Long-press the CTU app icon > App info > Notifications > Allow. 2. Set Battery > Unrestricted. 3. Tap LINK OS ALERTS again."
        );
      }
    } else {
      const res = await requestNotificationPermission();
      if (res === "granted") {
        setOsAlertsArmed(true);
        setPermissionNotice("OS Notification shade alerts armed.");
      } else {
        setPermissionNotice("Notifications are blocked in browser permissions. Tap the site settings/lock icon in your browser to permit.");
      }
    }
  };

  const handleTestAlert = async () => {
    CTUAudio.playChirp();
    if (isMedianEnv) {
      await sendMedianTestAlert("CTU TACTICAL OPS", "Threat-Con Charlie: Extraction Window Active");
    } else {
      await scheduleLocalAlert("test", "CTU TACTICAL OPS - TEST ALERT", Date.now() + 1000);
    }
  };

  const silenceActiveRinging = () => {
    try {
      CTUAudio.stopAllAudio();
    } catch {}
    setRingingAlert(null);
    clearLockscreenHUD().catch(() => {});
  };

  const renderDigitalClock = (timeStr: string, colorClass: string) => {
    const parts = timeStr.split(":");
    const h = parts[0] || "00";
    const m = parts[1] || "00";
    const s = parts[2] || "00";

    return (
      <div className={`text-lg sm:text-2xl font-black ${colorClass} tracking-wider font-mono tabular-nums whitespace-nowrap`}>
        <span>{h}</span>
        <span className={`inline-block px-[1px] transition-opacity duration-75 ${colonVisible ? "opacity-100" : "opacity-20"}`}>:</span>
        <span>{m}</span>
        <span className={`inline-block px-[1px] transition-opacity duration-75 ${colonVisible ? "opacity-100" : "opacity-20"}`}>:</span>
        <span>{s}</span>
      </div>
    );
  };

  const activeTimer: TimerItem = timers.find((t) => t.id === focusedTimerId) || timers[0] || INITIAL_TIMERS[0]!;

  // Chronologically sorted items for PiP HUD
  const sortedTimers = [...timers].sort((a, b) => {
    if (a.status === "RUNNING" && b.status === "RUNNING") return a.remainingSec - b.remainingSec;
    if (a.status === "RUNNING") return -1;
    if (b.status === "RUNNING") return 1;
    if (a.status === "PAUSED" && b.status === "PAUSED") return a.remainingSec - b.remainingSec;
    if (a.status === "PAUSED") return -1;
    if (b.status === "PAUSED") return 1;
    return a.remainingSec - b.remainingSec;
  });

  const sortedAlarms = [...alarms].sort((a, b) => {
    if (a.enabled && !b.enabled) return -1;
    if (!a.enabled && b.enabled) return 1;
    return a.timeStr.localeCompare(b.timeStr);
  });

  return (
    <div className="min-h-screen bg-[#07090b] text-[#ffcc00] font-mono selection:bg-[#ffcc00]/20 pb-28 select-none">
      {/* Tactical Grid Scanline Background */}
      <div className="fixed inset-0 pointer-events-none opacity-25 bg-[radial-gradient(#ffcc00_1px,transparent_1px)] [background-size:24px_24px] z-0" />

      {/* Top Header Bar */}
      <header className="relative z-10 border-b border-[#ffcc00]/30 bg-[#0c1015]/90 backdrop-blur px-4 py-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-[#ffcc00] shadow-[0_0_8px_#ffcc00] animate-pulse" />
          <h1 className="font-black tracking-widest text-base sm:text-lg text-glow">CTU // LOS ANGELES SECTOR 4</h1>
          <span className="text-xs px-2 py-0.5 border border-[#ffcc00]/40 text-[#ffcc00]/80 rounded">
            {isMedianEnv ? "APK NATIVE" : "PWA CORE"}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={toggleSilentClock}
            className={`px-3 py-1 text-xs font-bold border transition-colors ${
              silentClock
                ? "bg-red-950 border-red-500 text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.4)]"
                : "border-[#ffcc00]/40 text-[#ffcc00]/70 hover:border-[#ffcc00]"
            }`}
          >
            {silentClock ? "SILENT CLOCK: ENGAGED" : "SILENT CLOCK"}
          </button>

          <button
            onClick={toggleWakeLock}
            className={`px-3 py-1 text-xs font-bold border transition-colors ${
              wakeLockActive
                ? "bg-[#ffcc00]/20 border-[#ffcc00] text-[#ffcc00]"
                : "border-[#ffcc00]/40 text-[#ffcc00]/60 hover:border-[#ffcc00]"
            }`}
          >
            {wakeLockActive ? "WAKE: ACTIVE" : "WAKE: OFF"}
          </button>

          <button
            onClick={handleLinkOsAlerts}
            className={`px-3 py-1 text-xs font-bold border transition-colors ${
              osAlertsArmed
                ? "bg-emerald-950 border-emerald-500 text-emerald-400"
                : "border-[#ffcc00]/40 text-[#ffcc00]/70 hover:border-[#ffcc00]"
            }`}
          >
            {osAlertsArmed ? "ALERTS: ARMED" : "LINK OS ALERTS"}
          </button>

          <button
            onClick={handleTestAlert}
            className="px-2.5 py-1 text-xs font-bold border border-[#ffcc00]/30 hover:border-[#ffcc00] text-[#ffcc00]/80"
          >
            TEST ALERT
          </button>
        </div>
      </header>

      {/* Permission / Notice Banner */}
      {permissionNotice && (
        <div className="relative z-10 bg-amber-950/80 border-b border-amber-600/60 px-4 py-2 text-xs text-amber-200 flex items-center justify-between">
          <span>{permissionNotice}</span>
          <button onClick={() => setPermissionNotice(null)} className="font-bold underline ml-4 hover:text-white">
            DISMISS
          </button>
        </div>
      )}

      {/* Silent Clock Indicator */}
      {silentClock && (
        <div className="relative z-10 bg-red-950/40 border-b border-red-600/40 px-4 py-1.5 text-center text-xs tracking-wider text-red-400">
          * SILENT CLOCK PROTOCOL ACTIVE — ALL COUNTDOWNS TERMINATE IN REVERENT SILENCE *
        </div>
      )}

      {/* Ringing Zero-Hour Emergency Banner */}
      {ringingAlert && (
        <div className="relative z-20 bg-red-600 text-black px-4 py-3 flex items-center justify-between shadow-[0_0_20px_#ef4444] animate-pulse">
          <div className="flex items-center gap-3">
            <span className="text-xl font-black">! TARGET ZERO REACHED !</span>
            <span className="font-bold text-sm tracking-widest">{ringingAlert.label}</span>
          </div>
          <button
            onClick={silenceActiveRinging}
            className="px-4 py-1.5 bg-black text-[#ffcc00] font-black border border-black hover:bg-neutral-900 transition-colors"
          >
            SILENCE PROTOCOL
          </button>
        </div>
      )}

      {/* Main Container */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 py-4 space-y-4">
        {/* MEDIUM SPEED CHRONOLOGICAL WORLDWIDE TICKER (ABOVE LOCAL TIME) */}
        <div className="border border-[#ffcc00]/40 bg-[#080c12] rounded-sm overflow-hidden py-1.5 shadow-[0_0_12px_rgba(255,204,0,0.08)]">
          <div className="flex items-center px-3 pb-1 border-b border-[#ffcc00]/20 mb-1">
            <span className="text-[10px] font-black tracking-widest text-[#ffcc00]/70 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffcc00] animate-ping" />
              GLOBAL SURVEILLANCE CHRONOMETRY // WEST TO EAST
            </span>
          </div>

          <div className="overflow-hidden w-full whitespace-nowrap">
            <div className="world-ticker-track">
              {/* Copy 1 */}
              <div className="flex items-center gap-6 pr-6">
                {WORLD_STATIONS.map((st) => (
                  <div key={`c1-${st.code}`} className="inline-flex items-center gap-2 text-xs font-mono">
                    <span className="text-[#ffcc00]/50 font-bold tracking-wider">{st.code}</span>
                    <span className="text-[#ffcc00] font-black tracking-widest tabular-nums">
                      {worldTimes[st.code] || "00:00:00"}
                    </span>
                    <span className="text-[9px] px-1 py-0.2 bg-[#ffcc00]/10 text-[#ffcc00]/60 rounded">
                      {st.offset}
                    </span>
                    <span className="text-[#ffcc00]/30 font-bold ml-1">/</span>
                  </div>
                ))}
              </div>

              {/* Seamless Copy 2 */}
              <div className="flex items-center gap-6 pr-6">
                {WORLD_STATIONS.map((st) => (
                  <div key={`c2-${st.code}`} className="inline-flex items-center gap-2 text-xs font-mono">
                    <span className="text-[#ffcc00]/50 font-bold tracking-wider">{st.code}</span>
                    <span className="text-[#ffcc00] font-black tracking-widest tabular-nums">
                      {worldTimes[st.code] || "00:00:00"}
                    </span>
                    <span className="text-[9px] px-1 py-0.2 bg-[#ffcc00]/10 text-[#ffcc00]/60 rounded">
                      {st.offset}
                    </span>
                    <span className="text-[#ffcc00]/30 font-bold ml-1">/</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Real-time Primary Clocks (Bangkok & Zulu) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="border border-[#ffcc00]/30 bg-[#0e141c]/80 p-4 rounded-sm flex items-center justify-between">
            <div>
              <div className="text-xs text-[#ffcc00]/60 tracking-wider">LOCAL TIME // ASIA (BANGKOK)</div>
              {renderDigitalClock(bangkokTime, "text-[#ffcc00]")}
            </div>
            <div className="text-right text-xs text-[#ffcc00]/50">UTC+7</div>
          </div>

          <div className="border border-[#ffcc00]/30 bg-[#0e141c]/80 p-4 rounded-sm flex items-center justify-between">
            <div>
              <div className="text-xs text-[#ffcc00]/60 tracking-wider">TACTICAL TIME // ZULU (UTC)</div>
              {renderDigitalClock(zuluTime, "text-[#ff9900]")}
            </div>
            <div className="text-right text-xs text-[#ffcc00]/50">ZULU 00</div>
          </div>
        </div>

        {/* Primary Operational Countdown Centerpiece */}
        <section className="border-2 border-[#ffcc00]/50 bg-[#0b1017] p-6 rounded-sm shadow-[0_0_15px_rgba(255,204,0,0.1)]">
          <div className="flex items-center justify-between border-b border-[#ffcc00]/30 pb-2 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 bg-[#ffcc00]/20 text-[#ffcc00] font-bold">PRIMARY TARGET</span>
              <span className="font-bold tracking-widest text-sm text-[#ffcc00]">{activeTimer.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 font-bold ${activeTimer.status === "RUNNING" ? "bg-amber-500 text-black animate-pulse" : "border border-[#ffcc00]/40 text-[#ffcc00]/60"}`}>
                {activeTimer.status}
              </span>
            </div>
          </div>

          <div className="text-center py-6">
            <div className="text-6xl sm:text-8xl font-black font-mono tracking-widest text-[#ffcc00] tabular-nums drop-shadow-[0_0_12px_rgba(255,204,0,0.4)]">
              {formatTime(activeTimer.remainingSec)}
            </div>
            <div className="text-xs text-[#ffcc00]/50 tracking-widest mt-2">EVENTS OCCUR IN REAL TIME</div>
          </div>

          {/* Quick Controls */}
          <div className="flex items-center justify-center gap-3 pt-4 border-t border-[#ffcc00]/20 flex-wrap">
            {activeTimer.status === "RUNNING" ? (
              <button
                onClick={() => pauseTimer(activeTimer.id)}
                className="px-6 py-2.5 bg-[#ff9900] text-black font-black hover:bg-[#ffaa00] transition-colors"
              >
                HOLD COUNTDOWN
              </button>
            ) : (
              <button
                onClick={() => startTimer(activeTimer.id)}
                className="px-6 py-2.5 bg-[#ffcc00] text-black font-black hover:bg-[#ffe066] transition-colors"
              >
                ENGAGE COUNTDOWN
              </button>
            )}

            <button
              onClick={() => resetTimer(activeTimer.id)}
              className="px-4 py-2.5 border border-[#ffcc00]/40 text-[#ffcc00] font-bold hover:border-[#ffcc00]"
            >
              RESET
            </button>

            <button
              onClick={() => handleOpenPickerForTimer(activeTimer.id)}
              className="px-4 py-2.5 border border-[#ffcc00]/40 text-[#ffcc00] font-bold hover:border-[#ffcc00]"
            >
              ADJUST DURATION
            </button>
          </div>
        </section>

        {/* 24 Tactical Presets */}
        <section className="space-y-2">
          <div className="text-xs text-[#ffcc00]/60 tracking-wider">TACTICAL QUICK-ARM PRESETS</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {[
              { label: "TAC SPRINT", sec: 1500 },
              { label: "BREACH (3M)", sec: 180 },
              { label: "PURGE (7M)", sec: 420 },
              { label: "STAND-DOWN", sec: 300 },
              { label: "EXTRACTION", sec: 1200 },
              { label: "INTERROGATION", sec: 900 },
              { label: "SAT PASS", sec: 2700 },
            ].map((p, idx) => (
              <button
                key={idx}
                onClick={() => {
                  CTUAudio.playChirp();
                  setTimers((prev) =>
                    prev.map((t) => (t.id === focusedTimerId ? { ...t, durationSec: p.sec, remainingSec: p.sec, status: "IDLE" } : t))
                  );
                }}
                className="p-2 border border-[#ffcc00]/30 bg-[#0d1218] hover:border-[#ffcc00] text-left transition-colors"
              >
                <div className="text-xs font-bold text-[#ffcc00] truncate">{p.label}</div>
                <div className="text-xs text-[#ffcc00]/50">{Math.floor(p.sec / 60)}:00</div>
              </button>
            ))}
          </div>
        </section>

        {/* Tactical PiP HUD Launcher Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => openFloatingPip("TIMERS")}
            className="p-4 border-2 border-[#ffcc00]/60 bg-[#0f1620] hover:bg-[#141d2b] text-left transition-colors flex items-center justify-between"
          >
            <div>
              <div className="font-black text-sm text-[#ffcc00]">LAUNCH TIMERS TACTICAL PIP HUD</div>
              <div className="text-xs text-[#ffcc00]/60">Floating multi-countdown draggable overlay with XXL digits</div>
            </div>
            <span className="text-xl">⬈</span>
          </button>

          <button
            onClick={() => openFloatingPip("ALARMS")}
            className="p-4 border-2 border-[#ff9900]/60 bg-[#0f1620] hover:bg-[#141d2b] text-left transition-colors flex items-center justify-between"
          >
            <div>
              <div className="font-black text-sm text-[#ff9900]">LAUNCH ALARMS TACTICAL PIP HUD</div>
              <div className="text-xs text-[#ff9900]/60">Floating daily operational alarms chronological monitor</div>
            </div>
            <span className="text-xl">⬈</span>
          </button>
        </div>

        {/* Timers & Alarms Operational Matrices */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Active Mission Timers Matrix */}
          <div className="border border-[#ffcc00]/30 bg-[#0a0f16] p-4 rounded-sm space-y-3">
            <div className="flex items-center justify-between border-b border-[#ffcc00]/20 pb-2">
              <span className="text-xs font-bold tracking-wider text-[#ffcc00]">MISSION TIMERS ({timers.length})</span>
              <span className="text-xs text-[#ffcc00]/50">CHRONOLOGICAL MATRIX</span>
            </div>

            <div className="space-y-2">
              {timers.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setFocusedTimerId(t.id)}
                  className={`p-3 border rounded-sm transition-colors cursor-pointer flex items-center justify-between ${
                    focusedTimerId === t.id ? "border-[#ffcc00] bg-[#141c26]" : "border-[#ffcc00]/20 bg-[#0d1218] hover:border-[#ffcc00]/40"
                  }`}
                >
                  <div>
                    <div className="text-xs font-bold tracking-wide text-[#ffcc00]">{t.label}</div>
                    <div className="text-2xl font-black font-mono text-[#ffcc00] tabular-nums">{formatTime(t.remainingSec)}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    {t.status === "RUNNING" ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          pauseTimer(t.id);
                        }}
                        className="px-3 py-1 bg-[#ff9900] text-black font-bold text-xs"
                      >
                        HOLD
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startTimer(t.id);
                        }}
                        className="px-3 py-1 bg-[#ffcc00] text-black font-bold text-xs"
                      >
                        START
                      </button>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        resetTimer(t.id);
                      }}
                      className="px-2 py-1 border border-[#ffcc00]/40 text-[#ffcc00] text-xs hover:border-[#ffcc00]"
                    >
                      RESET
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenPickerForTimer(t.id);
                      }}
                      className="px-2 py-1 border border-[#ffcc00]/40 text-[#ffcc00] text-xs hover:border-[#ffcc00]"
                    >
                      EDIT
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Daily Operational Alarms Matrix */}
          <div className="border border-[#ffcc00]/30 bg-[#0a0f16] p-4 rounded-sm space-y-3">
            <div className="flex items-center justify-between border-b border-[#ffcc00]/20 pb-2">
              <span className="text-xs font-bold tracking-wider text-[#ff9900]">OPERATIONAL ALARMS ({alarms.length})</span>
              <span className="text-xs text-[#ff9900]/50">SAMSUNG / RECURRING</span>
            </div>

            <div className="space-y-2">
              {alarms.map((a) => (
                <div
                  key={a.id}
                  className="p-3 border border-[#ffcc00]/20 bg-[#0d1218] rounded-sm flex items-center justify-between"
                >
                  <div>
                    <div className="text-xs font-bold text-[#ffcc00]">{a.label}</div>
                    <div className="text-2xl font-black font-mono text-[#ff9900] tabular-nums">{a.timeStr}</div>
                    <div className="text-[10px] text-[#ffcc00]/50">
                      {a.days.length === 7 ? "EVERY DAY" : a.days.length === 5 ? "WEEKDAYS" : "CUSTOM DAYS"}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        CTUAudio.playChirp();
                        setAlarms((prev) =>
                          prev.map((item) => (item.id === a.id ? { ...item, enabled: !item.enabled } : item))
                        );
                      }}
                      className={`px-3 py-1 text-xs font-bold border transition-colors ${
                        a.enabled
                          ? "bg-[#ffcc00] text-black border-[#ffcc00]"
                          : "border-[#ffcc00]/30 text-[#ffcc00]/50 hover:border-[#ffcc00]"
                      }`}
                    >
                      {a.enabled ? "ARMED" : "OFF"}
                    </button>

                    <button
                      onClick={() => handleOpenPickerForAlarm(a.id)}
                      className="px-2 py-1 border border-[#ffcc00]/40 text-[#ffcc00] text-xs hover:border-[#ffcc00]"
                    >
                      EDIT
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* BUILT-IN FLOATING TACTICAL PIP HUD WINDOW (DRAGGABLE & RESIZABLE) */}
      {floatingPipOpen && (
        <div
          style={{
            position: "fixed",
            left: pipPosition?.x ?? 20,
            top: pipPosition?.y ?? 100,
            zIndex: 9999,
          }}
          className={`border-2 border-[#ffcc00] bg-[#090d12]/95 backdrop-blur-md rounded shadow-[0_0_25px_rgba(255,204,0,0.3)] transition-all ${
            floatingPipMinimized ? "w-64 p-2" : "w-[92vw] max-w-[480px] p-4"
          }`}
        >
          {/* Header Drag Bar */}
          <div
            onMouseDown={(e) => handleDragStart(e.clientX, e.clientY)}
            onTouchStart={(e) => {
              if (e.touches[0]) handleDragStart(e.touches[0].clientX, e.touches[0].clientY);
            }}
            className="cursor-move flex items-center justify-between border-b border-[#ffcc00]/30 pb-2 mb-3 bg-[#111722]/50 px-2 py-1 select-none"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#ffcc00] animate-ping" />
              <span className="font-black text-xs tracking-wider text-[#ffcc00]">
                PIP HUD // {floatingPipMode}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setFloatingPipMode((m) => (m === "TIMERS" ? "ALARMS" : "TIMERS"))}
                className="text-[10px] font-bold px-1.5 py-0.5 border border-[#ffcc00]/40 text-[#ffcc00] hover:bg-[#ffcc00]/20"
              >
                SWAP
              </button>
              <button
                onClick={() => setFloatingPipMinimized((prev) => !prev)}
                className="text-[10px] font-bold px-1.5 py-0.5 border border-[#ffcc00]/40 text-[#ffcc00]"
              >
                {floatingPipMinimized ? "EXPAND" : "MIN"}
              </button>
              <button
                onClick={() => setFloatingPipOpen(false)}
                className="text-xs font-black px-1.5 py-0.5 text-red-400 hover:text-red-200"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Minimized View */}
          {floatingPipMinimized ? (
            <div className="text-center py-2">
              <div className="text-3xl font-black font-mono text-[#ffcc00] tracking-wider">
                {floatingPipMode === "TIMERS" ? formatTime(sortedTimers[0]?.remainingSec || 0) : sortedAlarms[0]?.timeStr || "--:--"}
              </div>
              <div className="text-[10px] text-[#ffcc00]/60 truncate">{sortedTimers[0]?.label || "IDLE"}</div>
            </div>
          ) : (
            /* Expanded Full HUD List with XXL Font */
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {floatingPipMode === "TIMERS"
                ? sortedTimers.map((t) => (
                    <div
                      key={t.id}
                      className={`p-2.5 border rounded flex items-center justify-between ${
                        t.status === "RUNNING"
                          ? "border-[#ffcc00] bg-[#16202c]"
                          : "border-[#ffcc00]/20 bg-[#0d131a]"
                      }`}
                    >
                      <div>
                        <div className="text-[11px] font-bold text-[#ffcc00]/80 tracking-wider truncate">{t.label}</div>
                        <div className="text-3xl sm:text-4xl font-black font-mono text-[#ffcc00] tracking-widest tabular-nums">
                          {formatTime(t.remainingSec)}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {t.status === "RUNNING" ? (
                          <button
                            onClick={() => pauseTimer(t.id)}
                            className="px-2.5 py-1 bg-[#ff9900] text-black font-black text-xs"
                          >
                            HOLD
                          </button>
                        ) : (
                          <button
                            onClick={() => startTimer(t.id)}
                            className="px-2.5 py-1 bg-[#ffcc00] text-black font-black text-xs"
                          >
                            START
                          </button>
                        )}
                        <button
                          onClick={() => resetTimer(t.id)}
                          className="px-2 py-1 border border-[#ffcc00]/40 text-[#ffcc00] text-xs hover:border-[#ffcc00]"
                        >
                          R
                        </button>
                      </div>
                    </div>
                  ))
                : sortedAlarms.map((a) => (
                    <div
                      key={a.id}
                      className={`p-2.5 border rounded flex items-center justify-between ${
                        a.enabled ? "border-[#ff9900] bg-[#1a1711]" : "border-[#ffcc00]/20 bg-[#0d131a]"
                      }`}
                    >
                      <div>
                        <div className="text-[11px] font-bold text-[#ff9900]/80 tracking-wider truncate">{a.label}</div>
                        <div className="text-3xl sm:text-4xl font-black font-mono text-[#ff9900] tracking-widest tabular-nums">
                          {a.timeStr}
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          CTUAudio.playChirp();
                          setAlarms((prev) =>
                            prev.map((item) => (item.id === a.id ? { ...item, enabled: !item.enabled } : item))
                          );
                        }}
                        className={`px-3 py-1 text-xs font-bold border transition-colors ${
                          a.enabled ? "bg-[#ff9900] text-black border-[#ff9900]" : "border-[#ffcc00]/30 text-[#ffcc00]/50"
                        }`}
                      >
                        {a.enabled ? "ARMED" : "OFF"}
                      </button>
                    </div>
                  ))}
            </div>
          )}
        </div>
      )}

      {/* Samsung Modal Wheel Time Picker */}
      {pickerOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm border-2 border-[#ffcc00] bg-[#0c1219] p-4 rounded shadow-2xl">
            <div className="text-center font-black text-sm text-[#ffcc00] tracking-widest mb-4 border-b border-[#ffcc00]/30 pb-2">
              CONFIGURE {pickerTargetType === "TIMER" ? "COUNTDOWN DURATION" : "ALARM TARGET"}
            </div>

            <SamsungTimePicker
              initialValues={pickerInitialValues}
              onConfirm={handlePickerConfirm}
              onCancel={() => setPickerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* T-10 Full Screen Tactical Takeover Modal */}
      {takeoverOpen && (
        <div className="fixed inset-0 z-[10000] bg-black/95 flex flex-col items-center justify-center p-6 text-center select-none animate-in fade-in duration-200">
          <div className="text-red-500 font-black tracking-widest text-lg sm:text-xl animate-pulse mb-2">
            CRITICAL MISSION COUNTDOWN // T-10 TAKEOVER
          </div>
          <div className="text-xs text-red-400/80 mb-6 font-bold">{takeoverSourceLabel}</div>

          <div className="text-8xl sm:text-9xl font-black font-mono text-red-500 drop-shadow-[0_0_30px_#ef4444] tabular-nums">
            {takeoverRemainingSec.toString().padStart(2, "0")}
          </div>

          <div className="mt-8 flex items-center gap-4">
            <button
              onClick={() => {
                CTUAudio.stopCountdownAudio();
                setTakeoverOpen(false);
              }}
              className="px-6 py-3 bg-red-600 text-black font-black hover:bg-red-500 transition-colors"
            >
              ABORT TAKEOVER
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
