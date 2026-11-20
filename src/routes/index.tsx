// src/routes/index.tsx — FULL DROP-IN REPLACEMENT FILE (ANDROID PIP & CHROME GESTURE FIX)
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
  syncWithNativePhoneClock,
  getNotificationPermissionStatus,
  requestNotificationPermission,
} from "@/lib/background-alerts";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CTU Tactical Ops Terminal // 24 Mission Clocks & Timers" },
      { name: "description", content: "24 CTU Multi-Timer, Alarm and Surveillance Operations Terminal." },
      { property: "og:title", content: "CTU Tactical Ops Terminal // 24" },
      { property: "og:description", content: "Tactical mission timers, alarms, and surveillance HUD." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CTUTacticalOpsTerminal,
});

export type TimerItem = {
  id: string;
  label: string;
  durationSec: number;
  remainingSec: number;
  status: "IDLE" | "RUNNING" | "PAUSED" | "EXPIRED";
  targetEpochMs?: number | undefined;
  zeroSound: ZeroSoundType;
};

export type AlarmItem = {
  id: string;
  label: string;
  timeStr: string; // "HH:MM"
  days: number[]; // 0 = Sun, 1 = Mon ... 6 = Sat
  enabled: boolean;
  zeroSound: ZeroSoundType;
};

const INITIAL_TIMERS: TimerItem[] = [
  { id: "timer-1", label: "TAC SPRINT", durationSec: 1500, remainingSec: 1500, status: "IDLE", zeroSound: "theme" },
  { id: "timer-2", label: "INTERROGATION", durationSec: 900, remainingSec: 900, status: "IDLE", zeroSound: "theme" },
  { id: "timer-3", label: "SAT PASS", durationSec: 2700, remainingSec: 2700, status: "IDLE", zeroSound: "theme" },
  { id: "timer-4", label: "STAND-DOWN", durationSec: 300, remainingSec: 300, status: "IDLE", zeroSound: "theme" },
  { id: "timer-5", label: "PERIMETER SWEEP", durationSec: 1200, remainingSec: 1200, status: "IDLE", zeroSound: "theme" },
  { id: "timer-6", label: "INTEL EXTRACTION", durationSec: 1800, remainingSec: 1800, status: "IDLE", zeroSound: "theme" },
];

const INITIAL_ALARMS: AlarmItem[] = [
  { id: "alarm-1", label: "FIELD SHIFT A", timeStr: "06:00", days: [1, 2, 3, 4, 5], enabled: true, zeroSound: "theme" },
  { id: "alarm-2", label: "ZULU BRIEF", timeStr: "14:00", days: [1, 2, 3, 4, 5], enabled: false, zeroSound: "theme" },
  { id: "alarm-3", label: "COMMS SYNC", timeStr: "22:00", days: [0, 1, 2, 3, 4, 5, 6], enabled: true, zeroSound: "theme" },
  { id: "alarm-4", label: "SATELLITE DOWNLINK", timeStr: "03:30", days: [1, 3, 5], enabled: true, zeroSound: "theme" },
  { id: "alarm-5", label: "COMMAND HANDOFF", timeStr: "08:00", days: [0, 1, 2, 3, 4, 5, 6], enabled: true, zeroSound: "theme" },
  { id: "alarm-6", label: "DRONE PATROL REFUEL", timeStr: "18:45", days: [2, 4, 6], enabled: false, zeroSound: "theme" },
];

function formatHMS(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function getNextAlarmEpochMs(timeStr: string, days: number[]): number | null {
  if (!days || days.length === 0) return null;
  const parts = timeStr.split(":");
  const h = parseInt(parts[0] || "0", 10);
  const m = parseInt(parts[1] || "0", 10);
  if (isNaN(h) || isNaN(m)) return null;

  const now = new Date();
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(now.getTime() + offset * 86400000);
    candidate.setHours(h, m, 0, 0);

    if (candidate.getTime() > now.getTime()) {
      const dayOfWeek = candidate.getDay();
      if (days.includes(dayOfWeek)) {
        return candidate.getTime();
      }
    }
  }
  return null;
}

export function CTUTacticalOpsTerminal() {
  // Clocks
  const [bangkokTime, setBangkokTime] = useState<string>("00:00:00");
  const [zuluTime, setZuluTime] = useState<string>("00:00:00");
  const [colonVisible, setColonVisible] = useState<boolean>(true);
  const [isClientHydrated, setIsClientHydrated] = useState<boolean>(false);

  // Mobile View Navigation Tab State ("FOCUS" | "TIMERS" | "ALARMS")
  const [mobileTab, setMobileTab] = useState<"FOCUS" | "TIMERS" | "ALARMS">("FOCUS");

  // Timers & Alarms Queues
  const [timers, setTimers] = useState<TimerItem[]>(INITIAL_TIMERS);
  const [alarms, setAlarms] = useState<AlarmItem[]>(INITIAL_ALARMS);
  const [focusedTimerId, setFocusedTimerId] = useState<string>("timer-1");

  // Phone Notification Permission State
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">("default");

  // CTU Operational Clearance Popup State (First launch / Install modal)
  const [clearanceOpen, setClearanceOpen] = useState<boolean>(false);
  const [clearanceDone, setClearanceDone] = useState<boolean>(false);
  const [audioUnlocked, setAudioUnlocked] = useState<boolean>(false);

  // In-App Floating Tactical Mini-HUD (Mobile PiP Fallback)
  const [floatingHudActive, setFloatingHudActive] = useState<boolean>(false);
  const [floatingHudMode, setFloatingHudMode] = useState<"TIMERS" | "ALARMS">("TIMERS");

  // Samsung Picker Modal State
  const [pickerOpen, setPickerOpen] = useState<boolean>(false);
  const [pickerMode, setPickerMode] = useState<"timer" | "alarm">("timer");
  const [pickerTargetId, setPickerTargetId] = useState<string | null>(null);
  const [pickerDurationSec, setPickerDurationSec] = useState<number>(1500);
  const [pickerTimeStr, setPickerTimeStr] = useState<string>("06:00");
  const [pickerDays, setPickerDays] = useState<number[]>([1, 2, 3, 4, 5]);

  // Full Screen Takeover Modal
  const [takeoverOpen, setTakeoverOpen] = useState<boolean>(false);
  const [takeoverRemainingSec, setTakeoverRemainingSec] = useState<number>(10);
  const [takeoverSourceLabel, setTakeoverSourceLabel] = useState<string>("TACTICAL SPRINT");

  // Ringing Banner State
  const [ringingAlert, setRingingAlert] = useState<{ id: string; label: string; sound: ZeroSoundType } | null>(null);

  // PiP Native Tactical HUD Canvas & Video State
  const [pipActive, setPipActive] = useState<boolean>(false);
  const [pipMode, setPipMode] = useState<"TIMERS" | "ALARMS">("TIMERS");
  const pipCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);

  // Wake Lock
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);
  const wakeLockSentinel = useRef<WakeLockSentinel | null>(null);

  // Active references
  const timersRef = useRef(timers);
  timersRef.current = timers;
  const alarmsRef = useRef(alarms);
  alarmsRef.current = alarms;

  // Clock Update, Client Init & First-Launch Check
  useEffect(() => {
    setIsClientHydrated(true);
    initBackgroundAlerts().catch(() => {});
    const currentPerm = getNotificationPermissionStatus();
    setNotifPermission(currentPerm);

    try {
      const savedClearance = localStorage.getItem("ctu_clearance_completed_v1");
      if (savedClearance === "true") {
        setClearanceDone(true);
      } else {
        setClearanceOpen(true);
      }
    } catch {}

    const clockInterval = setInterval(() => {
      const now = new Date();
      setColonVisible((v) => !v);

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
    }, 1000);

    return () => clearInterval(clockInterval);
  }, []);

  // Tactical Offscreen Canvas PiP HUD Renderer (EXTRA LARGE FONTS & CHRONOLOGICAL SORTING)
  const renderPipFrame = useCallback(
    (mode: "TIMERS" | "ALARMS") => {
      const canvas = pipCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;

      // Terminal dark background
      ctx.fillStyle = "#070a0e";
      ctx.fillRect(0, 0, width, height);

      // Outer crisis/watch border outline
      ctx.lineWidth = 6;
      ctx.strokeStyle = takeoverOpen || ringingAlert ? "#ff1a1a" : "#ffcc00";
      ctx.strokeRect(3, 3, width - 6, height - 6);

      // Header Bar (XXL: 18px / 15px)
      ctx.fillStyle = takeoverOpen || ringingAlert ? "#ff1a1a" : "#ffcc00";
      ctx.font = "bold 18px 'Courier New', monospace";
      ctx.fillText(
        `CTU // ${mode === "TIMERS" ? "ACTIVE TIMERS HUD" : "ARMED ALARMS HUD"}`,
        18,
        32
      );

      ctx.fillStyle = "#9ca3af";
      ctx.font = "bold 15px 'Courier New', monospace";
      ctx.fillText(`BKK ${bangkokTime}`, width - 145, 32);

      // Dividing separator
      ctx.strokeStyle = "rgba(255, 204, 0, 0.4)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(14, 42);
      ctx.lineTo(width - 14, 42);
      ctx.stroke();

      if (mode === "TIMERS") {
        // Chronological sort: RUNNING by smallest remainingSec first, then PAUSED, then IDLE / EXPIRED
        const currentTimers = [...timersRef.current]
          .sort((a, b) => {
            const statusPriority: Record<string, number> = {
              RUNNING: 1,
              PAUSED: 2,
              IDLE: 3,
              EXPIRED: 4,
            };
            const priorityA = statusPriority[a.status] ?? 99;
            const priorityB = statusPriority[b.status] ?? 99;
            if (priorityA !== priorityB) {
              return priorityA - priorityB;
            }
            return a.remainingSec - b.remainingSec;
          })
          .slice(0, 6);

        let startY = 82;

        currentTimers.forEach((timer, idx) => {
          const isUrgent = timer.status === "RUNNING" && timer.remainingSec <= 10;
          const isRunning = timer.status === "RUNNING";

          ctx.fillStyle = isUrgent ? "#ff3333" : isRunning ? "#ffcc00" : "#6b7280";
          ctx.font = "bold 18px 'Courier New', monospace";
          const label = `${idx + 1}. ${timer.label.slice(0, 12).padEnd(12, " ")}`;
          ctx.fillText(label, 18, startY);

          ctx.font = "bold 24px 'Courier New', monospace";
          const timeText = formatHMS(timer.remainingSec);
          ctx.fillText(timeText, 250, startY);

          ctx.font = "bold 15px 'Courier New', monospace";
          const statusText = `[${timer.status}]`;
          ctx.fillText(statusText, 450, startY);

          startY += 48;
        });
      } else {
        // Chronological sort for alarms: nearest trigger time first, then disabled alarms
        const currentAlarms = [...alarmsRef.current]
          .map((alarm) => {
            const nextMs = getNextAlarmEpochMs(alarm.timeStr, alarm.days);
            const deltaSec = nextMs ? Math.max(0, Math.floor((nextMs - Date.now()) / 1000)) : Infinity;
            return { ...alarm, nextMs, deltaSec };
          })
          .sort((a, b) => {
            if (a.enabled && !b.enabled) return -1;
            if (!a.enabled && b.enabled) return 1;
            if (a.enabled && b.enabled) {
              return (a.nextMs ?? Infinity) - (b.nextMs ?? Infinity);
            }
            return a.timeStr.localeCompare(b.timeStr);
          })
          .slice(0, 6);

        let startY = 82;

        currentAlarms.forEach((alarm, idx) => {
          const isEnabled = alarm.enabled;
          const deltaSec = alarm.deltaSec === Infinity ? 0 : alarm.deltaSec;
          const isUrgent = isEnabled && deltaSec <= 10 && deltaSec > 0;

          ctx.fillStyle = isUrgent ? "#ff3333" : isEnabled ? "#38bdf8" : "#4b5563";
          ctx.font = "bold 18px 'Courier New', monospace";
          const label = `${idx + 1}. ${alarm.label.slice(0, 12).padEnd(12, " ")}`;
          ctx.fillText(label, 18, startY);

          ctx.font = "bold 24px 'Courier New', monospace";
          ctx.fillText(alarm.timeStr, 250, startY);

          ctx.font = "bold 15px 'Courier New', monospace";
          const statusText = isEnabled ? `IN ${formatHMS(deltaSec)}` : "[OFF]";
          ctx.fillText(statusText, 420, startY);

          startY += 48;
        });
      }
    },
    [bangkokTime, takeoverOpen, ringingAlert]
  );

  // Continuous PiP frame update
  useEffect(() => {
    if (!pipActive) return;
    const interval = setInterval(() => {
      renderPipFrame(pipMode);
    }, 500);
    return () => clearInterval(interval);
  }, [pipActive, pipMode, renderPipFrame]);

  // Open PiP with Android Chrome Gesture Preservation & Visible Surface Initialization
  const openPipHud = async (targetMode: "TIMERS" | "ALARMS") => {
    setPipMode(targetMode);
    setFloatingHudMode(targetMode);

    // Synchronously unlock audio in background WITHOUT awaiting to preserve the mobile gesture token
    CTUAudio.unlockAudio()
      .then(() => setAudioUnlocked(true))
      .catch(() => {});

    // Check for Samsung Internet which restricts canvas stream PiP
    if (typeof navigator !== "undefined" && /SamsungBrowser/i.test(navigator.userAgent)) {
      alert(
        "Samsung Internet restricts dynamic Picture-in-Picture streams.\n\nFor floating background PiP on Samsung devices, please open this app in Google Chrome."
      );
      setFloatingHudActive(true);
      return;
    }

    const isSupported =
      typeof document !== "undefined" &&
      "pictureInPictureEnabled" in document &&
      document.pictureInPictureEnabled;

    if (!isSupported) {
      setFloatingHudActive(true);
      return;
    }

    try {
      // Initialize 640x360 canvas if needed
      if (!pipCanvasRef.current) {
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 360;
        pipCanvasRef.current = canvas;
      }

      // Draw immediate frame before creating stream
      renderPipFrame(targetMode);

      // Create video element attached to DOM so Android hardware compositor treats it as active
      if (!pipVideoRef.current) {
        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        video.style.position = "fixed";
        video.style.bottom = "0";
        video.style.right = "0";
        video.style.width = "160px";
        video.style.height = "90px";
        video.style.opacity = "0.05";
        video.style.pointerEvents = "none";
        video.style.zIndex = "1";
        document.body.appendChild(video);
        pipVideoRef.current = video;
      }

      const stream = pipCanvasRef.current.captureStream(25);
      pipVideoRef.current.srcObject = stream;

      // Play video track
      await pipVideoRef.current.play();

      // Trigger Picture-in-Picture directly within user gesture scope
      await pipVideoRef.current.requestPictureInPicture();
      setPipActive(true);

      pipVideoRef.current.addEventListener(
        "leavepictureinpicture",
        () => {
          setPipActive(false);
        },
        { once: true }
      );
    } catch (err) {
      console.warn("[CTU] Native PiP restricted or blocked by OS. Engaging In-App Tactical HUD:", err);
      // Fallback to in-app floating mini HUD for mobile devices
      setFloatingHudActive(true);
    }
  };

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
      alarmsRef.current.forEach((a) => {
        if (!a.enabled) return;
        const nextMs = getNextAlarmEpochMs(a.timeStr, a.days);
        if (!nextMs) return;

        const deltaSec = Math.floor((nextMs - nowMs) / 1000);
        if (deltaSec <= 10 && deltaSec > 0 && !takeoverOpen) {
          setTakeoverOpen(true);
          setTakeoverSourceLabel(`ALARM: ${a.label} (${a.timeStr})`);
          setTakeoverRemainingSec(deltaSec);
          CTUAudio.startCountdownTakeoverAudio(deltaSec);
        } else if (deltaSec === 0 && !ringingAlert) {
          setTakeoverOpen(false);
          setRingingAlert({ id: a.id, label: a.label, sound: a.zeroSound });
          CTUAudio.triggerZeroSound(a.zeroSound);
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [takeoverOpen, ringingAlert]);

  // Request Notification Permissions from Phone / Browser
  const handleRequestNotifPermission = async () => {
    const res = await requestNotificationPermission();
    setNotifPermission(res);
    if (res === "denied") {
      alert(
        "Notification alerts are blocked in browser permissions.\n\nTo unblock on phone:\n1. Tap the lock/tune icon on the left of the address bar.\n2. Tap 'Permissions' > 'Reset permissions' (or set Notifications to 'Allow').\n3. Reload the page."
      );
    }
  };

  // Instant Phone Notification & Vibration Diagnostic
  const handleTestPhoneAlert = async () => {
    try {
      CTUAudio.unlockAudio();
      CTUAudio.playChirp();
      setAudioUnlocked(true);
    } catch {}

    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate([200, 100, 200, 100, 400]);
      } catch {}
    }

    let perm = notifPermission;
    if (perm !== "granted") {
      perm = await requestNotificationPermission();
      setNotifPermission(perm);
    }

    if (perm === "granted") {
      await updateLockscreenHUD(
        "CTU TACTICAL OPS // TEST ALERT",
        "Phone notification channel verified active. Ticking countdowns armed.",
        "test-diagnostic",
        Date.now() + 60000
      );
    }
  };

  // Audio Unlock Action
  const handleUnlockAudioEngine = async () => {
    try {
      await CTUAudio.unlockAudio();
      CTUAudio.playChirp();
      setAudioUnlocked(true);
    } catch (e) {
      console.warn("Audio unlock failed:", e);
    }
  };

  // Complete Clearance & Save State
  const handleCompleteClearance = () => {
    try {
      localStorage.setItem("ctu_clearance_completed_v1", "true");
    } catch {}
    setClearanceDone(true);
    setClearanceOpen(false);
  };

  // Timer Actions
  const handleExecuteTimer = async (id: string) => {
    try {
      CTUAudio.unlockAudio();
      CTUAudio.playChirp();
      setAudioUnlocked(true);
    } catch {}

    if (notifPermission === "default") {
      const res = await requestNotificationPermission();
      setNotifPermission(res);
    }

    setTimers((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const targetMs = Date.now() + t.remainingSec * 1000;

        scheduleLocalAlert({
          id: t.id,
          label: t.label,
          targetEpochMs: targetMs,
          type: "timer",
        }).catch(() => {});

        updateLockscreenHUD(
          `CTU TIMER: ${t.label}`,
          `Target: ${formatHMS(t.remainingSec)} remaining`,
          t.id,
          targetMs
        ).catch(() => {});

        return {
          ...t,
          status: "RUNNING",
          targetEpochMs: targetMs,
        };
      })
    );
  };

  const handlePauseTimer = (id: string) => {
    try {
      CTUAudio.playTick();
    } catch {}
    setTimers((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        cancelLocalAlert(t.id).catch(() => {});
        clearLockscreenHUD().catch(() => {});
        return {
          ...t,
          status: "PAUSED",
          targetEpochMs: undefined,
        };
      })
    );
  };

  const handleStopAndResetTimer = (id: string) => {
    try {
      CTUAudio.stopCountdownAudio();
      CTUAudio.stopAllAudio();
    } catch {}
    cancelLocalAlert(id).catch(() => {});
    clearLockscreenHUD().catch(() => {});

    if (ringingAlert?.id === id) {
      setRingingAlert(null);
    }
    if (takeoverOpen) {
      setTakeoverOpen(false);
    }

    setTimers((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        return {
          ...t,
          status: "IDLE",
          remainingSec: t.durationSec,
          targetEpochMs: undefined,
        };
      })
    );
  };

  const handleOpenPickerForTimer = (id: string) => {
    const t = timers.find((item) => item.id === id);
    if (!t) return;
    setPickerTargetId(id);
    setPickerMode("timer");
    setPickerDurationSec(t.durationSec);
    setPickerOpen(true);
  };

  const handleOpenPickerForAlarm = (id: string) => {
    const a = alarms.find((item) => item.id === id);
    if (!a) return;
    setPickerTargetId(id);
    setPickerMode("alarm");
    setPickerTimeStr(a.timeStr);
    setPickerDays(a.days);
    setPickerOpen(true);
  };

  const handlePickerConfirm = (values: SamsungTimePickerValues) => {
    if (pickerMode === "timer" && pickerTargetId) {
      const totalSec = values.totalSeconds > 0 ? values.totalSeconds : values.hours * 3600 + values.minutes * 60 + values.seconds;
      const validDuration = Math.max(1, totalSec);

      setTimers((prev) =>
        prev.map((t) => {
          if (t.id !== pickerTargetId) return t;
          return {
            ...t,
            durationSec: validDuration,
            remainingSec: validDuration,
            status: "IDLE",
            targetEpochMs: undefined,
          };
        })
      );
    } else if (pickerMode === "alarm" && pickerTargetId) {
      const timeStr = values.timeStr || `${values.hours.toString().padStart(2, "0")}:${values.minutes.toString().padStart(2, "0")}`;
      const days = values.days && values.days.length > 0 ? values.days : [1, 2, 3, 4, 5];

      setAlarms((prev) =>
        prev.map((a) => {
          if (a.id !== pickerTargetId) return a;
          return {
            ...a,
            timeStr,
            days,
            enabled: true,
          };
        })
      );
    }
    setPickerOpen(false);
  };

  const toggleAlarmEnabled = (id: string) => {
    try {
      CTUAudio.playChirp();
    } catch {}
    setAlarms((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        const newEnabled = !a.enabled;
        if (!newEnabled) {
          cancelLocalAlert(a.id).catch(() => {});
        }
        return { ...a, enabled: newEnabled };
      })
    );
  };

  // Wake Lock Toggle
  const toggleWakeLock = async () => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      alert("Screen Wake Lock API not supported on this device/browser.");
      return;
    }

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
        console.warn("[CTU] WakeLock error:", err);
      }
    }
  };

  const silenceActiveRinging = () => {
    try {
      CTUAudio.stopAllAudio();
    } catch {}
    setRingingAlert(null);
    clearLockscreenHUD().catch(() => {});
  };

  const cancelTakeoverCountdown = () => {
    try {
      CTUAudio.stopCountdownAudio();
      CTUAudio.stopAllAudio();
    } catch {}
    setTakeoverOpen(false);
  };

  const activeTimer: TimerItem = timers.find((t) => t.id === focusedTimerId) || timers[0] || {
    id: "timer-1",
    label: "TAC SPRINT",
    durationSec: 1500,
    remainingSec: 1500,
    status: "IDLE",
    zeroSound: "theme",
  };

  return (
    <div className="min-h-screen bg-[#070a0e] text-[#ffcc00] font-mono select-none flex flex-col p-2 sm:p-4 pb-20 md:pb-4">
      {/* Top Tactical Status Header Bar */}
      <header className="border-b border-[#ffcc00]/40 pb-2 mb-2 flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
          <span className="font-black text-xs sm:text-sm tracking-widest text-[#ffcc00]">
            CTU // LA OPS
          </span>
          <span className="text-[9px] bg-[#ffcc00]/10 border border-[#ffcc00]/30 px-1 py-0.5 rounded text-[#ffcc00]/80">
            DEFCON 2
          </span>

          {/* Operational Clearance Modal Launcher */}
          <button
            onClick={() => setClearanceOpen(true)}
            className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded border transition ${
              clearanceDone
                ? "border-emerald-500/60 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-950/80"
                : "border-amber-400 bg-amber-500/30 text-amber-300 animate-pulse hover:bg-amber-500/50"
            }`}
            title="Open CTU Operational Clearance & Samsung PiP / Permission Diagnostics"
          >
            {clearanceDone ? "CLEARANCE: OK" : "CLEARANCE: SETUP"}
          </button>
        </div>

        {/* Dual Dedicated PiP, Alerts Permission, Test Alert, and Wake Lock Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Notification Permission Chip / Trigger */}
          {notifPermission === "granted" ? (
            <span
              className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border border-emerald-500 bg-emerald-950/40 text-emerald-400"
              title="Phone notification alerts granted"
            >
              ALERTS: ON
            </span>
          ) : notifPermission === "denied" ? (
            <button
              onClick={handleRequestNotifPermission}
              className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border border-red-500 bg-red-950/60 text-red-300"
              title="Notifications are blocked in your phone settings. Click for instructions."
            >
              ALERTS: BLOCKED
            </button>
          ) : (
            <button
              onClick={handleRequestNotifPermission}
              className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded border border-amber-400 bg-amber-500/20 text-amber-300 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.5)]"
              title="Click to grant permission for phone notifications & background alarms"
            >
              ALLOW ALERTS
            </button>
          )}

          {/* Test Alert Diagnostic Button */}
          <button
            onClick={handleTestPhoneAlert}
            className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border border-blue-500/60 hover:bg-blue-500/20 text-blue-300"
            title="Fire an instant test alert and vibration"
          >
            TEST ALERT
          </button>

          {/* PiP Controls (Optimized for Android Chrome) */}
          <button
            onClick={() => openPipHud("TIMERS")}
            className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border transition-colors ${
              (pipActive && pipMode === "TIMERS") || (floatingHudActive && floatingHudMode === "TIMERS")
                ? "bg-[#ffcc00] text-black border-[#ffcc00] shadow-[0_0_8px_#ffcc00]"
                : "border-[#ffcc00]/40 hover:bg-[#ffcc00]/20 text-[#ffcc00]"
            }`}
            title="Launch Picture-in-Picture display to all active timers"
          >
            PIP TIMERS
          </button>

          <button
            onClick={() => openPipHud("ALARMS")}
            className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border transition-colors ${
              (pipActive && pipMode === "ALARMS") || (floatingHudActive && floatingHudMode === "ALARMS")
                ? "bg-sky-400 text-black border-sky-400 shadow-[0_0_8px_#38bdf8]"
                : "border-sky-400/40 hover:bg-sky-400/20 text-sky-400"
            }`}
            title="Launch Picture-in-Picture display to all active alarms"
          >
            PIP ALARMS
          </button>

          {/* Wake Lock Control */}
          <button
            onClick={toggleWakeLock}
            className={`px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border transition-colors ${
              wakeLockActive
                ? "bg-emerald-600/80 text-white border-emerald-500"
                : "border-gray-700 text-gray-400"
            }`}
          >
            {wakeLockActive ? "WAKE" : "WAKE OFF"}
          </button>
        </div>
      </header>

      {/* Ringing Alert Notification Banner */}
      {ringingAlert && (
        <div className="mb-3 bg-red-950/90 border-2 border-red-500 text-red-100 p-2.5 rounded flex items-center justify-between shadow-[0_0_25px_rgba(239,68,68,0.7)] animate-bounce">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <div>
              <div className="font-black text-xs uppercase tracking-widest text-red-300">
                ZERO EVENT // {ringingAlert.label}
              </div>
              <div className="text-[10px] text-red-200">
                Audio playing. Silence to clear emergency.
              </div>
            </div>
          </div>
          <button
            onClick={silenceActiveRinging}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase tracking-widest rounded border border-white/50"
          >
            SILENCE
          </button>
        </div>
      )}

      {/* In-App Floating Tactical Mini-HUD (Mobile PiP Fallback) */}
      {floatingHudActive && (
        <div className="mb-3 border-2 border-[#ffcc00] bg-[#0c111c] rounded p-2 shadow-[0_0_15px_rgba(255,204,0,0.3)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#ffcc00] animate-ping" />
            <div className="text-xs font-bold text-[#ffcc00]">
              FLOATING HUD // {floatingHudMode}:{" "}
              {floatingHudMode === "TIMERS"
                ? formatHMS(activeTimer.remainingSec)
                : `${alarms.filter((a) => a.enabled).length} ARMED`}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setFloatingHudMode((m) => (m === "TIMERS" ? "ALARMS" : "TIMERS"))}
              className="px-2 py-0.5 text-[10px] border border-[#ffcc00]/40 rounded hover:bg-[#ffcc00]/20"
            >
              SWITCH
            </button>
            <button
              onClick={() => setFloatingHudActive(false)}
              className="px-2 py-0.5 text-[10px] border border-red-500/50 text-red-400 rounded hover:bg-red-500/20"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Synchronized High-Density Twin Clocks */}
      <section className="grid grid-cols-2 gap-2 mb-3">
        <div className="border border-[#ffcc00]/40 bg-[#090d16] p-2 rounded">
          <div className="text-[9px] text-gray-400 tracking-wider">LOCAL TIME // BANGKOK</div>
          <div className="text-xl sm:text-3xl font-black text-[#ffcc00] tracking-widest">
            {colonVisible ? bangkokTime : bangkokTime.replace(/:/g, " ")}
          </div>
        </div>

        <div className="border border-[#ffcc00]/40 bg-[#090d16] p-2 rounded">
          <div className="text-[9px] text-gray-400 tracking-wider">MISSION TIME // ZULU</div>
          <div className="text-xl sm:text-3xl font-black text-sky-400 tracking-widest">
            {colonVisible ? zuluTime : zuluTime.replace(/:/g, " ")}
          </div>
        </div>
      </section>

      {/* Main Content Area: Responsive Mobile-Tabbed Layout */}
      <div className="flex-1 flex flex-col gap-3">
        {/* View 1: Primary Mission Focus Showcase */}
        <section
          className={`border-2 border-[#ffcc00] bg-[#090d16] p-3 sm:p-4 rounded shadow-[0_0_15px_rgba(255,204,0,0.15)] ${
            mobileTab === "FOCUS" ? "block" : "hidden md:block"
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest border-b border-[#ffcc00]/30 pb-2 mb-2">
            <span className="text-[#ffcc00]">
              FOCUS: {activeTimer.label} [{activeTimer.status}]
            </span>
            <span className="text-gray-400 text-[10px]">PRESET: {formatHMS(activeTimer.durationSec)}</span>
          </div>

          <div className="text-center py-2 sm:py-4">
            <div className="text-5xl sm:text-7xl font-black tracking-widest text-[#ffcc00]">
              {formatHMS(activeTimer.remainingSec)}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2">
            {activeTimer.status !== "RUNNING" ? (
              <button
                onClick={() => handleExecuteTimer(activeTimer.id)}
                className="flex-1 sm:flex-none px-5 py-2.5 bg-[#ffcc00] text-black font-black uppercase text-xs sm:text-sm tracking-widest rounded hover:bg-[#ffd633] active:scale-95 transition"
              >
                EXECUTE TIMER
              </button>
            ) : (
              <button
                onClick={() => handlePauseTimer(activeTimer.id)}
                className="flex-1 sm:flex-none px-5 py-2.5 bg-amber-600 text-black font-black uppercase text-xs sm:text-sm tracking-widest rounded hover:bg-amber-500 active:scale-95 transition"
              >
                HOLD / PAUSE
              </button>
            )}

            <button
              onClick={() => handleStopAndResetTimer(activeTimer.id)}
              className="px-3.5 py-2 border border-red-500/70 text-red-400 font-bold uppercase text-xs tracking-widest rounded hover:bg-red-500/20"
            >
              STOP / RESET
            </button>

            <button
              onClick={() => handleOpenPickerForTimer(activeTimer.id)}
              className="px-3.5 py-2 border border-[#ffcc00]/60 text-[#ffcc00] font-bold uppercase text-xs tracking-widest rounded hover:bg-[#ffcc00]/20"
            >
              EDIT
            </button>

            <button
              onClick={() =>
                syncWithNativePhoneClock("timer", {
                  durationSec: activeTimer.durationSec,
                  label: activeTimer.label,
                })
              }
              className="w-full sm:w-auto px-3.5 py-2 border border-blue-500/50 text-blue-300 font-bold uppercase text-xs tracking-widest rounded hover:bg-blue-500/20 text-center"
            >
              SAMSUNG PHONE SYNC
            </button>
          </div>
        </section>

        {/* Split Surveillance Tactical Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1">
          {/* Left Column: Mission Timers Queue */}
          <div
            className={`border border-[#ffcc00]/40 bg-[#090d16] p-2.5 rounded flex flex-col ${
              mobileTab === "TIMERS" ? "block" : "hidden md:flex"
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold text-[#ffcc00] uppercase tracking-wider pb-1.5 border-b border-[#ffcc00]/20 mb-2">
              <span>TACTICAL TIMERS QUEUE ({timers.length})</span>
              <span className="text-[10px] text-gray-400">TAP TO FOCUS</span>
            </div>

            <div className="space-y-1.5 flex-1 overflow-y-auto max-h-[380px] pr-1">
              {timers.map((t) => {
                const isFocused = t.id === focusedTimerId;
                const isRunning = t.status === "RUNNING";

                return (
                  <div
                    key={t.id}
                    onClick={() => {
                      setFocusedTimerId(t.id);
                      setMobileTab("FOCUS");
                    }}
                    className={`p-2 rounded border cursor-pointer transition-all flex items-center justify-between ${
                      isFocused
                        ? "border-[#ffcc00] bg-[#ffcc00]/10 shadow-[0_0_8px_rgba(255,204,0,0.2)]"
                        : "border-gray-800 bg-[#0c111c] hover:border-gray-600"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isRunning ? "bg-emerald-400 animate-ping" : "bg-gray-600"
                        }`}
                      />
                      <div>
                        <div className="font-bold text-xs text-[#ffcc00]">{t.label}</div>
                        <div className="text-[9px] text-gray-400">Preset: {formatHMS(t.durationSec)}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className="text-xs sm:text-sm font-black text-[#ffcc00] tracking-wider">
                          {formatHMS(t.remainingSec)}
                        </div>
                        <div className="text-[8px] text-gray-400 uppercase">[{t.status}]</div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenPickerForTimer(t.id);
                        }}
                        className="px-2 py-1 text-[10px] border border-gray-600 text-gray-300 hover:text-white rounded"
                      >
                        EDIT
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Armed Alarms Queue */}
          <div
            className={`border border-sky-400/40 bg-[#090d16] p-2.5 rounded flex flex-col ${
              mobileTab === "ALARMS" ? "block" : "hidden md:flex"
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold text-sky-400 uppercase tracking-wider pb-1.5 border-b border-sky-400/20 mb-2">
              <span>ARMED ALARMS QUEUE ({alarms.length})</span>
              <span className="text-[10px] text-gray-400">RECURRING SCHEDULE</span>
            </div>

            <div className="space-y-1.5 flex-1 overflow-y-auto max-h-[380px] pr-1">
              {alarms.map((a) => {
                const nextEpoch = getNextAlarmEpochMs(a.timeStr, a.days);
                const deltaSec =
                  isClientHydrated && nextEpoch ? Math.max(0, Math.floor((nextEpoch - Date.now()) / 1000)) : null;

                return (
                  <div
                    key={a.id}
                    className={`p-2 rounded border transition-all flex items-center justify-between ${
                      a.enabled
                        ? "border-sky-500/60 bg-sky-950/20"
                        : "border-gray-800 bg-[#0c111c] opacity-60"
                    }`}
                  >
                    <div>
                      <div className="font-bold text-xs text-sky-300">{a.label}</div>
                      <div className="text-[9px] text-gray-400">
                        Days: {a.days.map((d) => ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][d]).join(" ")}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className="text-xs sm:text-sm font-black text-sky-400 tracking-wider">
                          {a.timeStr}
                        </div>
                        {deltaSec !== null && a.enabled && (
                          <div className="text-[8px] text-gray-400">IN {formatHMS(deltaSec)}</div>
                        )}
                      </div>

                      <button
                        onClick={() => toggleAlarmEnabled(a.id)}
                        className={`px-2 py-1 text-[10px] font-bold uppercase rounded border ${
                          a.enabled
                            ? "bg-sky-500 text-black border-sky-400"
                            : "border-gray-700 text-gray-500"
                        }`}
                      >
                        {a.enabled ? "ARMED" : "OFF"}
                      </button>

                      <button
                        onClick={() => handleOpenPickerForAlarm(a.id)}
                        className="px-2 py-1 text-[10px] border border-gray-600 text-gray-300 hover:text-white rounded"
                      >
                        EDIT
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile-Only Bottom Tactical Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-[#070a0e]/95 backdrop-blur-md border-t border-[#ffcc00]/40 p-2 flex items-center justify-around z-40">
        <button
          onClick={() => setMobileTab("FOCUS")}
          className={`px-3 py-1.5 rounded text-xs font-black uppercase tracking-wider transition ${
            mobileTab === "FOCUS"
              ? "bg-[#ffcc00] text-black shadow-[0_0_10px_#ffcc00]"
              : "text-[#ffcc00]/70 hover:text-[#ffcc00]"
          }`}
        >
          FOCUS
        </button>

        <button
          onClick={() => setMobileTab("TIMERS")}
          className={`px-3 py-1.5 rounded text-xs font-black uppercase tracking-wider transition ${
            mobileTab === "TIMERS"
              ? "bg-[#ffcc00] text-black shadow-[0_0_10px_#ffcc00]"
              : "text-[#ffcc00]/70 hover:text-[#ffcc00]"
          }`}
        >
          TIMERS ({timers.length})
        </button>

        <button
          onClick={() => setMobileTab("ALARMS")}
          className={`px-3 py-1.5 rounded text-xs font-black uppercase tracking-wider transition ${
            mobileTab === "ALARMS"
              ? "bg-sky-400 text-black shadow-[0_0_10px_#38bdf8]"
              : "text-sky-400/70 hover:text-sky-400"
          }`}
        >
          ALARMS ({alarms.length})
        </button>
      </nav>

      {/* Samsung Time Picker Modal */}
      {pickerOpen && (
        <SamsungTimePicker
          isOpen={pickerOpen}
          mode={pickerMode}
          title={pickerMode === "timer" ? "SET TIMER DURATION" : "SET ALARM SCHEDULE"}
          initialDurationSec={pickerDurationSec}
          initialTimeStr={pickerTimeStr}
          initialDays={pickerDays}
          onConfirm={handlePickerConfirm}
          onCancel={() => setPickerOpen(false)}
        />
      )}

      {/* CTU OPERATIONAL CLEARANCE & SAMSUNG PIP EXCEPTION POPUP */}
      {clearanceOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-[#0a0f18] border-2 border-[#ffcc00] rounded-lg shadow-[0_0_30px_rgba(255,204,0,0.35)] p-4 sm:p-6 text-[#ffcc00] space-y-4 my-auto">
            {/* Modal Header */}
            <div className="border-b border-[#ffcc00]/40 pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-amber-500 animate-ping" />
                  <span className="text-xs sm:text-sm font-black tracking-widest text-[#ffcc00] uppercase">
                    CTU OPERATIONAL CLEARANCE PROTOCOL
                  </span>
                </div>
                <button
                  onClick={() => setClearanceOpen(false)}
                  className="text-gray-400 hover:text-white text-xs px-2 py-0.5 border border-gray-700 rounded"
                >
                  ✕ CLOSE
                </button>
              </div>
              <p className="text-[10px] text-gray-300 mt-1 uppercase tracking-wider">
                First-launch hardware authorization for audio playback, phone lockscreen alerts & Samsung PiP exceptions.
              </p>
            </div>

            {/* Checklist of Protocols */}
            <div className="space-y-3 text-xs">
              {/* Protocol 1: Audio Engine */}
              <div className="border border-[#ffcc00]/30 bg-[#0c1322] p-2.5 rounded flex items-center justify-between gap-2">
                <div>
                  <div className="font-bold flex items-center gap-2">
                    <span className="text-amber-400">1. AUDIO ENGINE UNLOCK</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-black ${
                        audioUnlocked
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                          : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                      }`}
                    >
                      {audioUnlocked ? "UNLOCKED" : "STANDBY"}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    Authorizes 24 countdown ticking, sirens, and at-zero alarms.
                  </div>
                </div>
                <button
                  onClick={handleUnlockAudioEngine}
                  className="px-3 py-1.5 bg-[#ffcc00] text-black font-black uppercase text-[10px] tracking-wider rounded hover:bg-[#ffd633]"
                >
                  ARM AUDIO
                </button>
              </div>

              {/* Protocol 2: Phone Notification Shade & Lockscreen */}
              <div className="border border-[#ffcc00]/30 bg-[#0c1322] p-2.5 rounded flex items-center justify-between gap-2">
                <div>
                  <div className="font-bold flex items-center gap-2">
                    <span className="text-amber-400">2. NOTIFICATION SHADE ALERTS</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-black ${
                        notifPermission === "granted"
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                          : notifPermission === "denied"
                          ? "bg-red-500/20 text-red-400 border border-red-500/40"
                          : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                      }`}
                    >
                      {notifPermission === "granted" ? "GRANTED" : notifPermission === "denied" ? "BLOCKED" : "REQUIRED"}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    Permits live timer countdowns in phone notifications & vibrations.
                  </div>
                </div>
                <button
                  onClick={handleRequestNotifPermission}
                  className="px-3 py-1.5 bg-blue-500 text-white font-black uppercase text-[10px] tracking-wider rounded hover:bg-blue-400"
                >
                  ALLOW ALERTS
                </button>
              </div>

              {/* Protocol 3: Picture-in-Picture & Samsung Exception */}
              <div className="border border-sky-400/40 bg-[#081224] p-3 rounded space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-sky-400 flex items-center gap-2">
                    <span>3. PICTURE-IN-PICTURE (PIP) EXCEPTION</span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded font-black bg-sky-500/20 text-sky-300 border border-sky-400/40">
                      GOOGLE CHROME
                    </span>
                  </div>
                  <button
                    onClick={() => openPipHud("TIMERS")}
                    className="px-2.5 py-1 bg-sky-400 text-black font-black uppercase text-[10px] tracking-wider rounded hover:bg-sky-300"
                  >
                    TEST PIP
                  </button>
                </div>

                <div className="text-[10px] text-gray-300 bg-black/40 p-2 rounded border border-sky-400/20 space-y-1">
                  <div className="font-bold text-sky-300 uppercase tracking-wide">
                    ⚠️ Samsung OneUI / Android PiP Settings Exception:
                  </div>
                  <div className="text-gray-300 leading-relaxed">
                    Android requires Google Chrome and an OS Special Access toggle for PiP windows:
                  </div>
                  <ol className="list-decimal list-inside space-y-0.5 text-gray-400 pl-1">
                    <li>Open phone <strong>Settings</strong> → <strong>Apps</strong>.</li>
                    <li>Tap the <strong>three dots menu (⋮)</strong> top right → <strong>Special app access</strong>.</li>
                    <li>Select <strong>Picture-in-picture</strong>.</li>
                    <li>Set <strong>Chrome</strong> &amp; <strong>CTU Ops</strong> to <strong>Allowed</strong>.</li>
                  </ol>
                  <div className="text-[9px] text-amber-300/90 pt-1">
                    ✓ Note: Samsung Internet blocks canvas PiP. Always use Google Chrome for Android PiP.
                  </div>
                </div>
              </div>

              {/* Protocol 4: Screen Wake Lock */}
              <div className="border border-[#ffcc00]/30 bg-[#0c1322] p-2.5 rounded flex items-center justify-between gap-2">
                <div>
                  <div className="font-bold flex items-center gap-2">
                    <span className="text-amber-400">4. FIELD SCREEN WAKE LOCK</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-black ${
                        wakeLockActive
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                          : "bg-gray-700 text-gray-300"
                      }`}
                    >
                      {wakeLockActive ? "ACTIVE" : "STANDBY"}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    Prevents display from sleeping during critical countdowns.
                  </div>
                </div>
                <button
                  onClick={toggleWakeLock}
                  className="px-3 py-1.5 border border-emerald-500/60 text-emerald-300 hover:bg-emerald-500/20 font-bold uppercase text-[10px] tracking-wider rounded"
                >
                  {wakeLockActive ? "ENGAGED" : "ARM WAKE"}
                </button>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-2 border-t border-[#ffcc00]/30 flex flex-wrap items-center justify-between gap-2">
              <button
                onClick={handleTestPhoneAlert}
                className="px-3 py-2 border border-blue-500/60 text-blue-300 hover:bg-blue-500/20 text-xs font-bold uppercase tracking-wider rounded"
              >
                TEST VIBRATION &amp; ALERT
              </button>

              <button
                onClick={handleCompleteClearance}
                className="px-5 py-2 bg-[#ffcc00] hover:bg-[#ffd633] text-black font-black text-xs uppercase tracking-widest rounded shadow-[0_0_15px_rgba(255,204,0,0.5)] transition"
              >
                CONFIRM &amp; ENTER TERMINAL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* T-10 Full Screen Crisis Countdown Takeover */}
      {takeoverOpen && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4 border-8 border-red-600 animate-pulse">
          <div className="text-red-500 font-black text-xl sm:text-2xl uppercase tracking-widest mb-2">
            ⚠️ T-MINUS EMERGENCY TAKEOVER ⚠️
          </div>
          <div className="text-gray-300 text-xs sm:text-sm uppercase tracking-wider mb-8 text-center">
            MISSION EVENT IMMINENT // {takeoverSourceLabel}
          </div>

          <div className="text-8xl sm:text-9xl font-black text-red-500 font-mono tracking-widest scale-110">
            {takeoverRemainingSec.toString().padStart(2, "0")}
          </div>

          <button
            onClick={cancelTakeoverCountdown}
            className="mt-8 px-6 py-2 border border-red-500 text-red-400 hover:bg-red-500/20 text-xs font-bold uppercase tracking-widest rounded"
          >
            ABORT COUNTDOWN
          </button>
        </div>
      )}
    </div>
  );
}
