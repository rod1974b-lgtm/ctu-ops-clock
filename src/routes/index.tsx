// src/routes/index.tsx — FULL REPLACEMENT FILE
import { createFileRoute } from "@tanstack/react-router";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { SamsungTimePicker } from "@/components/samsung-time-picker";
import { CTUAudio, ZeroSoundType } from "@/lib/ctu-audio";
import {
  registerCTUWorker,
  scheduleBackgroundAlert,
  cancelBackgroundAlert,
  updateLockscreenHUD,
  clearLockscreenHUD,
  syncWithNativePhoneClock,
} from "@/lib/background-alerts";

export const Route = createFileRoute("/")({
  component: CTUTerminalRoute,
  head: () => ({
    meta: [
      { title: "CTU // 24 OPERATIONAL TERMINAL" },
      { name: "description", content: "24 CTU Tactical Mission Timer & Precision Multi-Alarm System" },
      { property: "og:title", content: "CTU // 24 OPERATIONAL TERMINAL" },
      { property: "og:description", content: "24 CTU Tactical Mission Timer & Precision Multi-Alarm System" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

interface MissionTimer {
  id: string;
  label: string;
  durationSec: number;
  remainingSec: number;
  status: "READY" | "RUNNING" | "HOLD" | "EXPIRED";
  zeroSound: ZeroSoundType;
}

interface TacticalAlarm {
  id: string;
  label: string;
  timeStr: string; // HH:MM
  days: number[]; // 0=Sun..6=Sat
  armed: boolean;
  zeroSound: ZeroSoundType;
}

const INITIAL_TIMERS: MissionTimer[] = [
  { id: "timer-1", label: "TACTICAL SPRINT", durationSec: 25 * 60, remainingSec: 25 * 60, status: "READY", zeroSound: "ctu_beep" },
  { id: "timer-2", label: "FIELD INTERROGATION", durationSec: 15 * 60, remainingSec: 15 * 60, status: "READY", zeroSound: "voice" },
  { id: "timer-3", label: "SATELLITE PASS", durationSec: 45 * 60, remainingSec: 45 * 60, status: "READY", zeroSound: "alarm" },
];

const INITIAL_ALARMS: TacticalAlarm[] = [
  { id: "alarm-1", label: "MANDATORY BRIEFING", timeStr: "06:00", days: [1, 2, 3, 4, 5], armed: true, zeroSound: "voice" },
  { id: "alarm-2", label: "PERIMETER CHECK", timeStr: "12:00", days: [0, 1, 2, 3, 4, 5, 6], armed: false, zeroSound: "boom" },
  { id: "alarm-3", label: "INTEL HANDOFF", timeStr: "18:00", days: [1, 2, 3, 4, 5], armed: true, zeroSound: "ctu_beep" },
];

const QUICK_PRESETS = [
  { label: "25M SPRINT", sec: 25 * 60 },
  { label: "15M INTERROGATION", sec: 15 * 60 },
  { label: "45M SAT PASS", sec: 45 * 60 },
  { label: "5M STAND-DOWN", sec: 5 * 60 },
];

// Bulletproof HH:MM:SS format: immune to NaN and null
export const formatHMS = (totalSec: number) => {
  if (totalSec == null || typeof totalSec !== "number" || isNaN(totalSec) || !isFinite(totalSec)) {
    return "00:00:00";
  }
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

export default function CTUTerminalRoute() {
  const [mounted, setMounted] = useState(false);
  const [currentTimeBangkok, setCurrentTimeBangkok] = useState("");
  const [currentTimeZulu, setCurrentTimeZulu] = useState("");
  const [currentDateStr, setCurrentDateStr] = useState("");
  const [blinkColon, setBlinkColon] = useState(true);

  // Timers & Alarms
  const [timers, setTimers] = useState<MissionTimer[]>(INITIAL_TIMERS);
  const [selectedTimerId, setSelectedTimerId] = useState<string>("timer-1");
  const [alarms, setAlarms] = useState<TacticalAlarm[]>(INITIAL_ALARMS);

  // Picker modal state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<"timer" | "alarm">("timer");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  // v74 Exact 10->0 Countdown Takeover Modal State
  const [takeoverOpen, setTakeoverOpen] = useState(false);
  const [takeoverDigit, setTakeoverDigit] = useState<number>(10);
  const [takeoverLabel, setTakeoverLabel] = useState<string>("TIMER / ALARM");
  const [takeoverIsCrimson, setTakeoverIsCrimson] = useState<boolean>(false);
  const takeoverActiveRef = useRef(false);
  const takeoverIntervalRef = useRef<number | null>(null);
  const takeoverCallbackRef = useRef<(() => void) | null>(null);

  // Global Ringing Alarm State
  const [ringingAlarmId, setRingingAlarmId] = useState<string | null>(null);

  // Mobile Features
  const [osAlertsEnabled, setOsAlertsEnabled] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [wirePhoneClock, setWirePhoneClock] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // PiP Canvas & Video elements
  const pipCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const [isPipActive, setIsPipActive] = useState(false);

  // Accurate Deadlines map for running timers
  const timerDeadlinesRef = useRef<Map<string, number>>(new Map());

  // 1. Mount & Initialization (Cleanse any corrupted localStorage)
  useEffect(() => {
    setMounted(true);
    registerCTUWorker();

    try {
      const savedT = localStorage.getItem("ctu_timers_v74");
      if (savedT) {
        const parsed = JSON.parse(savedT);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const sanitized = parsed.map((t: any, idx: number): MissionTimer => {
            const rawDur = Number(t?.durationSec);
            const rawRem = Number(t?.remainingSec);
            const durationSec = !isNaN(rawDur) && rawDur > 0 ? rawDur : 25 * 60;
            const remainingSec = !isNaN(rawRem) && rawRem >= 0 ? rawRem : durationSec;
            return {
              id: t?.id || `timer-${idx + 1}`,
              label: t?.label || `TARGET ${idx + 1}`,
              durationSec,
              remainingSec,
              status: ["READY", "RUNNING", "HOLD", "EXPIRED"].includes(t?.status) ? t.status : "READY",
              zeroSound: ["voice", "boom", "alarm", "ctu_beep", "stinger"].includes(t?.zeroSound) ? t.zeroSound : "ctu_beep",
            };
          });
          setTimers(sanitized);
        }
      }

      const savedA = localStorage.getItem("ctu_alarms_v74");
      if (savedA) {
        const parsedA = JSON.parse(savedA);
        if (Array.isArray(parsedA) && parsedA.length > 0) {
          const sanitizedA = parsedA.map((a: any, idx: number): TacticalAlarm => {
            const timeStr = typeof a?.timeStr === "string" && a.timeStr.includes(":") ? a.timeStr : "08:00";
            const days = Array.isArray(a?.days) && a.days.length > 0 ? a.days.filter((d: any) => typeof d === "number") : [1, 2, 3, 4, 5];
            return {
              id: a?.id || `alarm-${idx + 1}`,
              label: a?.label || `TASK ${idx + 1}`,
              timeStr,
              days: days.length > 0 ? days : [1, 2, 3, 4, 5],
              armed: typeof a?.armed === "boolean" ? a.armed : true,
              zeroSound: ["voice", "boom", "alarm", "ctu_beep", "stinger"].includes(a?.zeroSound) ? a.zeroSound : "alarm",
            };
          });
          setAlarms(sanitizedA);
        }
      }

      const savedWire = localStorage.getItem("ctu_wire_phone_clock");
      if (savedWire) setWirePhoneClock(JSON.parse(savedWire));
    } catch {
      // Ignored
    }

    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      setOsAlertsEnabled(true);
    }
  }, []);

  // Save changes
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

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem("ctu_wire_phone_clock", JSON.stringify(wirePhoneClock));
    } catch {}
  }, [wirePhoneClock, mounted]);

  // Wake lock management
  useEffect(() => {
    const hasRunningTimer = timers.some((t) => t.status === "RUNNING");
    if (hasRunningTimer && !wakeLockRef.current && typeof navigator !== "undefined" && "wakeLock" in navigator) {
      navigator.wakeLock.request("screen").then((lock) => {
        wakeLockRef.current = lock;
        setWakeLockActive(true);
        lock.addEventListener("release", () => {
          wakeLockRef.current = null;
          setWakeLockActive(false);
        });
      }).catch(() => {});
    } else if (!hasRunningTimer && wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
      setWakeLockActive(false);
    }
  }, [timers]);

  // Draw PiP Canvas
  const drawPipCanvas = useCallback((timeStr: string, label: string, isCrimson = false) => {
    const canvas = pipCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = isCrimson ? "#ff0000" : "#ffcc00";
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

    ctx.fillStyle = isCrimson ? "#ff0000" : "#ffcc00";
    ctx.font = "bold 16px Consolas, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`CTU // ${label.toUpperCase()}`, canvas.width / 2, 28);

    ctx.font = "bold 44px Consolas, monospace";
    ctx.fillText(timeStr, canvas.width / 2, 85);
  }, []);

  /**
   * v74 Takeover Countdown Sequence (Guarded against NaN):
   * Opens full-screen takeover modal with amber-to-crimson transition and ticks
   */
  const launchTakeoverCountdown = useCallback((seconds: number, label: string, onComplete: () => void) => {
    CTUAudio.unlock();
    if (takeoverIntervalRef.current) {
      clearInterval(takeoverIntervalRef.current);
      takeoverIntervalRef.current = null;
    }

    const safeSec = typeof seconds === "number" && !isNaN(seconds) ? Math.max(0, Math.floor(seconds)) : 10;

    takeoverActiveRef.current = true;
    setTakeoverOpen(true);
    setTakeoverDigit(safeSec);
    setTakeoverLabel(label);
    const isCrim = safeSec <= 3;
    setTakeoverIsCrimson(isCrim);
    takeoverCallbackRef.current = onComplete;

    // First tick
    CTUAudio.playTick(isCrim, true);

    let currentSec = safeSec;
    takeoverIntervalRef.current = window.setInterval(() => {
      currentSec -= 1;

      if (currentSec < 0) {
        if (takeoverIntervalRef.current) {
          clearInterval(takeoverIntervalRef.current);
          takeoverIntervalRef.current = null;
        }
        takeoverActiveRef.current = false;
        setTakeoverOpen(false);
        if (takeoverCallbackRef.current) {
          takeoverCallbackRef.current();
        }
        return;
      }

      setTakeoverDigit(currentSec);
      const nowCrimson = currentSec <= 3;
      setTakeoverIsCrimson(nowCrimson);
      CTUAudio.playTick(nowCrimson, true);
    }, 1000);
  }, []);

  const cancelTakeoverCountdown = useCallback(() => {
    if (takeoverIntervalRef.current) {
      clearInterval(takeoverIntervalRef.current);
      takeoverIntervalRef.current = null;
    }
    takeoverActiveRef.current = false;
    setTakeoverOpen(false);
    CTUAudio.stopAll();
  }, []);

  // Master 1-Second Precision Operational Loop
  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = new Date();
      setBlinkColon((b) => !b);

      // Bangkok & Zulu formatted clocks
      try {
        const bangkokFmt = new Intl.DateTimeFormat("en-US", {
          timeZone: "Asia/Bangkok",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(now);
        setCurrentTimeBangkok(bangkokFmt);

        const zuluFmt = new Intl.DateTimeFormat("en-US", {
          timeZone: "UTC",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(now);
        setCurrentTimeZulu(zuluFmt);

        const dateFmt = new Intl.DateTimeFormat("en-US", {
          timeZone: "Asia/Bangkok",
          weekday: "short",
          month: "short",
          day: "2-digit",
          year: "numeric",
        }).format(now).toUpperCase();
        setCurrentDateStr(dateFmt);
      } catch {
        // Fallback
      }

      // Check Active Timers
      setTimers((prevTimers) => {
        let hasActive = false;
        let hudRemaining = 0;
        let hudLabel = "";

        const updated = prevTimers.map((timer) => {
          if (timer.status !== "RUNNING") return timer;

          const deadline = timerDeadlinesRef.current.get(timer.id);
          const rawRemaining = deadline ? Math.ceil((deadline - Date.now()) / 1000) : timer.remainingSec - 1;
          const remaining = isNaN(rawRemaining) ? 0 : Math.max(0, rawRemaining);

          hasActive = true;
          hudRemaining = remaining;
          hudLabel = timer.label;

          // v74 Exact 10-Second Transition to Takeover
          if (remaining === 10 && !takeoverActiveRef.current) {
            timerDeadlinesRef.current.delete(timer.id);
            window.setTimeout(() => {
              launchTakeoverCountdown(10, timer.label, () => {
                CTUAudio.playZeroPayload(timer.zeroSound);
                setTimers((current) =>
                  current.map((t) => (t.id === timer.id ? { ...t, remainingSec: 0, status: "EXPIRED" } : t))
                );
              });
            }, 50);
            return { ...timer, remainingSec: 10, status: "HOLD" as const };
          }

          // Zero hit
          if (remaining <= 0) {
            timerDeadlinesRef.current.delete(timer.id);
            CTUAudio.playZeroPayload(timer.zeroSound);
            return { ...timer, remainingSec: 0, status: "EXPIRED" as const };
          }

          return { ...timer, remainingSec: remaining };
        });

        // Update PiP and Lockscreen HUD
        if (hasActive) {
          const formatted = formatHMS(hudRemaining);
          drawPipCanvas(formatted, hudLabel, hudRemaining <= 10);
          updateLockscreenHUD(hudLabel, formatted, hudRemaining);
        } else {
          clearLockscreenHUD();
        }

        return updated;
      });

      // Check Armed Tactical Alarms (Bangkok Time)
      const bkkParts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Bangkok",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        hour12: false,
      }).formatToParts(now);

      const bkkHour = parseInt(bkkParts.find((p) => p.type === "hour")?.value || "0", 10);
      const bkkMin = parseInt(bkkParts.find((p) => p.type === "minute")?.value || "0", 10);
      const bkkSec = parseInt(bkkParts.find((p) => p.type === "second")?.value || "0", 10);
      const bkkDay = (now.getUTCDay() + (now.getUTCHours() + 7 >= 24 ? 1 : 0)) % 7;

      alarms.forEach((alarm) => {
        if (!alarm.armed) return;
        if (!alarm.days.includes(bkkDay)) return;
        if (!alarm.timeStr || !alarm.timeStr.includes(":")) return;

        const [aH, aM] = alarm.timeStr.split(":").map(Number);
        if (isNaN(aH) || isNaN(aM)) return;

        // Calculate seconds until alarm
        const diffSec = (aH - bkkHour) * 3600 + (aM - bkkMin) * 60 - bkkSec;

        // v74 Exact 10 Seconds Before Alarm -> Launch Takeover Countdown
        if (diffSec === 10 && !takeoverActiveRef.current) {
          launchTakeoverCountdown(10, `ALARM: ${alarm.label}`, () => {
            setRingingAlarmId(alarm.id);
            CTUAudio.playZeroPayload(alarm.zeroSound);
          });
        }

        // Direct hit if app opened at the exact minute
        if (diffSec === 0 && !takeoverActiveRef.current && ringingAlarmId !== alarm.id) {
          setRingingAlarmId(alarm.id);
          CTUAudio.playZeroPayload(alarm.zeroSound);
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [alarms, drawPipCanvas, launchTakeoverCountdown, ringingAlarmId]);

  // Execute Timer Handler
  const handleExecuteTimer = (id: string) => {
    CTUAudio.unlock();
    CTUAudio.playChirp();

    setTimers((prev) =>
      prev.map((timer) => {
        if (timer.id !== id) return timer;

        const rawStart = timer.remainingSec > 0 ? timer.remainingSec : timer.durationSec;
        const startingSec = !isNaN(rawStart) && rawStart > 0 ? rawStart : 25 * 60;

        // v74: If started with <= 10 seconds, immediately launch takeover
        if (startingSec <= 10) {
          window.setTimeout(() => {
            launchTakeoverCountdown(startingSec, timer.label, () => {
              CTUAudio.playZeroPayload(timer.zeroSound);
              setTimers((current) =>
                current.map((t) => (t.id === id ? { ...t, remainingSec: 0, status: "EXPIRED" } : t))
              );
            });
          }, 80);
          return { ...timer, remainingSec: startingSec, status: "HOLD" };
        }

        const deadline = Date.now() + startingSec * 1000;
        timerDeadlinesRef.current.set(timer.id, deadline);
        scheduleBackgroundAlert(timer.id, timer.label, startingSec);

        if (wirePhoneClock) {
          syncWithNativePhoneClock("timer", startingSec);
        }

        return { ...timer, remainingSec: startingSec, status: "RUNNING" };
      })
    );
  };

  // Hold Timer Handler
  const handleHoldTimer = (id: string) => {
    timerDeadlinesRef.current.delete(id);
    cancelBackgroundAlert(id);
    setTimers((prev) => prev.map((t) => (t.id === id ? { ...t, status: "HOLD" } : t)));
  };

  // Reset Timer Handler
  const handleResetTimer = (id: string) => {
    timerDeadlinesRef.current.delete(id);
    cancelBackgroundAlert(id);
    setTimers((prev) => prev.map((t) => (t.id === id ? { ...t, remainingSec: t.durationSec, status: "READY" } : t)));
  };

  // Preset Selection Handler
  const handleSelectPreset = (sec: number) => {
    const safeSec = !isNaN(sec) && sec > 0 ? sec : 25 * 60;
    setTimers((prev) =>
      prev.map((t) => (t.id === selectedTimerId ? { ...t, durationSec: safeSec, remainingSec: safeSec, status: "READY" } : t))
    );
  };

  // Sound selection handler
  const handleSelectSound = (id: string, sound: ZeroSoundType, type: "timer" | "alarm") => {
    if (type === "timer") {
      setTimers((prev) => prev.map((t) => (t.id === id ? { ...t, zeroSound: sound } : t)));
    } else {
      setAlarms((prev) => prev.map((a) => (a.id === id ? { ...a, zeroSound: sound } : a)));
    }
    CTUAudio.playZeroPayload(sound);
  };

  // Toggle Picture-in-Picture
  const handleTogglePip = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPipActive(false);
        return;
      }

      const canvas = pipCanvasRef.current;
      const video = pipVideoRef.current;
      if (!canvas || !video) return;

      const active = timers.find((t) => t.id === selectedTimerId) || timers[0];
      drawPipCanvas(formatHMS(active.remainingSec), active.label);

      if (!video.srcObject) {
        const stream = canvas.captureStream(10);
        video.srcObject = stream;
        await video.play();
      }

      await video.requestPictureInPicture();
      setIsPipActive(true);

      video.addEventListener("leavepictureinpicture", () => {
        setIsPipActive(false);
      });
    } catch {
      // PiP unavailable or cancelled
    }
  };

  // OS Alerts Permission Request
  const handleLinkOSAlerts = async () => {
    if (typeof Notification === "undefined") return;
    try {
      const perm = await Notification.requestPermission();
      if (perm === "granted") {
        setOsAlertsEnabled(true);
      }
    } catch {
      // Ignored
    }
  };

  // Samsung Clock Intent Sync
  const handleSyncSamsungClock = () => {
    const active = timers.find((t) => t.id === selectedTimerId) || timers[0];
    syncWithNativePhoneClock("timer", active.durationSec);
  };

  // Selected Timer
  const activeTimer = timers.find((t) => t.id === selectedTimerId) || timers[0] || INITIAL_TIMERS[0];

  return (
    <div className="min-h-screen bg-black text-[#ffcc00] font-mono selection:bg-[#ffcc00] selection:text-black p-2 sm:p-4 md:p-6 flex flex-col items-center select-none">
      {/* Hidden elements for PiP Streaming */}
      <canvas ref={pipCanvasRef} width={300} height={120} className="hidden" />
      <video ref={pipVideoRef} muted playsInline className="hidden" />

      {/* Top Header & Mobile Failsafe Controls */}
      <header className="w-full max-w-4xl border border-[#ffcc00]/40 bg-black/90 p-3 mb-4 rounded shadow-[0_0_15px_rgba(255,204,0,0.15)] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-[#ffcc00] animate-pulse" />
          <h1 className="text-lg sm:text-xl font-black tracking-widest text-[#ffcc00] uppercase">
            CTU // 24 TERMINAL
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleTogglePip}
            className={`text-xs px-2.5 py-1 font-bold border transition-colors ${
              isPipActive
                ? "bg-[#ffcc00] text-black border-[#ffcc00]"
                : "border-[#ffcc00]/60 hover:bg-[#ffcc00]/20 text-[#ffcc00]"
            }`}
          >
            {isPipActive ? "[PIP ACTIVE]" : "POP MINI-HUD (PIP)"}
          </button>

          <button
            onClick={handleSyncSamsungClock}
            className="text-xs px-2.5 py-1 font-bold border border-[#ffcc00]/60 hover:bg-[#ffcc00]/20 text-[#ffcc00]"
            title="Wires target directly into Android native Clock app"
          >
            SYNC SAMSUNG CLOCK
          </button>

          <button
            onClick={handleLinkOSAlerts}
            className={`text-xs px-2.5 py-1 font-bold border transition-colors ${
              osAlertsEnabled
                ? "border-green-500 text-green-400"
                : "border-red-500 text-red-400 hover:bg-red-950/30 animate-pulse"
            }`}
          >
            {osAlertsEnabled ? "OS ALERTS: LINKED" : "LINK OS ALERTS"}
          </button>

          <span
            className={`text-[10px] px-2 py-0.5 border font-semibold ${
              wakeLockActive ? "border-[#ffcc00] text-[#ffcc00]" : "border-neutral-800 text-neutral-600"
            }`}
          >
            {wakeLockActive ? "WAKE LOCK: ENGAGED" : "WAKE LOCK: IDLE"}
          </span>
        </div>
      </header>

      {/* Main Grid: Mission Clock + Zulu */}
      <section className="w-full max-w-4xl border border-[#ffcc00]/40 bg-black/80 p-4 mb-4 rounded flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="text-center md:text-left">
          <div className="text-xs text-[#ffcc00]/70 uppercase tracking-widest">BANGKOK HQ (UTC+7)</div>
          <div className="text-3xl sm:text-4xl md:text-5xl font-black tracking-widest text-[#ffcc00] drop-shadow-[0_0_12px_rgba(255,204,0,0.6)]">
            {currentTimeBangkok ? (
              currentTimeBangkok.split(":").map((chunk, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <span className={blinkColon ? "opacity-100" : "opacity-20"}>:</span>}
                  <span>{chunk}</span>
                </React.Fragment>
              ))
            ) : (
              "11:30:00"
            )}
          </div>
          <div className="text-xs text-[#ffcc00]/60 mt-1">{currentDateStr || "TUE, NOV 17, 2026"}</div>
        </div>

        <div className="text-center md:text-right border-t md:border-t-0 md:border-l border-[#ffcc00]/20 pt-2 md:pt-0 md:pl-6">
          <div className="text-xs text-neutral-400 uppercase tracking-widest">ZULU TIME (UTC)</div>
          <div className="text-2xl sm:text-3xl font-bold tracking-widest text-neutral-300">
            {currentTimeZulu || "04:30:00"}
          </div>
          <div className="text-[10px] text-neutral-500 mt-1">REAL-TIME SYNCHRONIZED</div>
        </div>
      </section>

      {/* Primary Active Timer Countdown Display */}
      <section className="w-full max-w-4xl border-2 border-[#ffcc00] bg-black p-4 sm:p-6 mb-4 rounded-lg shadow-[0_0_25px_rgba(255,204,0,0.25)] flex flex-col items-center">
        <div className="w-full flex items-center justify-between text-xs text-[#ffcc00]/70 border-b border-[#ffcc00]/20 pb-2 mb-4">
          <span className="font-bold uppercase tracking-widest">ACTIVE TARGET: {activeTimer.label}</span>
          <span
            className={`px-2 py-0.5 rounded font-bold ${
              activeTimer.status === "RUNNING"
                ? "bg-[#ffcc00] text-black animate-pulse"
                : activeTimer.status === "EXPIRED"
                ? "bg-red-600 text-white animate-bounce"
                : "bg-neutral-800 text-[#ffcc00]"
            }`}
          >
            {activeTimer.status}
          </span>
        </div>

        {/* Big 7-Segment Digital Readout (Tap to adjust) */}
        <div
          onClick={() => {
            setPickerMode("timer");
            setEditingItemId(activeTimer.id);
            setPickerOpen(true);
          }}
          className="cursor-pointer group flex flex-col items-center my-2 p-3 hover:bg-[#ffcc00]/5 rounded border border-transparent hover:border-[#ffcc00]/30 transition-all"
          title="Tap to adjust operational duration"
        >
          <div className="text-5xl sm:text-7xl md:text-8xl font-black tracking-widest text-[#ffcc00] drop-shadow-[0_0_18px_rgba(255,204,0,0.7)] group-hover:scale-[1.02] transition-transform">
            {formatHMS(activeTimer.remainingSec)}
          </div>
          <span className="text-[11px] text-[#ffcc00]/50 tracking-widest mt-1 uppercase group-hover:text-[#ffcc00]">
            [ TAP DIGITS TO MODIFY TIME ]
          </span>
        </div>

        {/* Quick Presets Bar */}
        <div className="flex flex-wrap items-center justify-center gap-2 my-3">
          {QUICK_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => handleSelectPreset(preset.sec)}
              className="text-xs px-2.5 py-1 border border-[#ffcc00]/40 hover:bg-[#ffcc00] hover:text-black text-[#ffcc00] transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Zero Payload Audio Selector */}
        <div className="flex flex-wrap items-center justify-center gap-2 my-2 text-xs">
          <span className="text-neutral-400">AT-ZERO PAYLOAD:</span>
          {(["ctu_beep", "voice", "boom", "alarm", "stinger"] as ZeroSoundType[]).map((snd) => (
            <button
              key={snd}
              onClick={() => handleSelectSound(activeTimer.id, snd, "timer")}
              className={`px-2 py-0.5 border ${
                activeTimer.zeroSound === snd
                  ? "bg-[#ffcc00] text-black border-[#ffcc00] font-bold"
                  : "border-neutral-700 text-neutral-400 hover:border-[#ffcc00]/60"
              }`}
            >
              {snd.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Master Execution Controls */}
        <div className="flex flex-wrap items-center justify-center gap-4 mt-4 w-full">
          {activeTimer.status !== "RUNNING" ? (
            <button
              onClick={() => handleExecuteTimer(activeTimer.id)}
              className="flex-1 max-w-xs py-3 bg-[#ffcc00] text-black font-black text-lg sm:text-xl tracking-widest uppercase hover:bg-[#ffd633] active:scale-95 shadow-[0_0_15px_rgba(255,204,0,0.4)] transition-all"
            >
              EXECUTE
            </button>
          ) : (
            <button
              onClick={() => handleHoldTimer(activeTimer.id)}
              className="flex-1 max-w-xs py-3 bg-red-600 text-white font-black text-lg sm:text-xl tracking-widest uppercase hover:bg-red-500 active:scale-95 shadow-[0_0_15px_rgba(255,0,0,0.4)] transition-all"
            >
              HOLD
            </button>
          )}

          <button
            onClick={() => handleResetTimer(activeTimer.id)}
            className="px-6 py-3 border border-[#ffcc00]/60 text-[#ffcc00] font-bold tracking-widest uppercase hover:bg-[#ffcc00]/20 active:scale-95 transition-all"
          >
            RESET
          </button>
        </div>
      </section>

      {/* Multiple Mission Timers Queue */}
      <section className="w-full max-w-4xl border border-[#ffcc00]/40 bg-black/90 p-4 mb-4 rounded">
        <div className="flex items-center justify-between border-b border-[#ffcc00]/30 pb-2 mb-3">
          <h2 className="text-sm font-bold tracking-widest uppercase text-[#ffcc00]">ARMED MISSION TIMERS</h2>
          <button
            onClick={() => {
              const newT: MissionTimer = {
                id: `timer-${Date.now()}`,
                label: `TARGET ${timers.length + 1}`,
                durationSec: 10 * 60,
                remainingSec: 10 * 60,
                status: "READY",
                zeroSound: "ctu_beep",
              };
              setTimers([...timers, newT]);
              setSelectedTimerId(newT.id);
            }}
            className="text-xs px-2 py-1 bg-[#ffcc00]/20 hover:bg-[#ffcc00] hover:text-black border border-[#ffcc00] font-bold transition-colors"
          >
            + NEW TIMER
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {timers.map((t) => (
            <div
              key={t.id}
              onClick={() => setSelectedTimerId(t.id)}
              className={`p-2.5 border flex flex-wrap items-center justify-between gap-2 cursor-pointer transition-colors ${
                t.id === selectedTimerId
                  ? "border-[#ffcc00] bg-[#ffcc00]/10 shadow-[0_0_10px_rgba(255,204,0,0.15)]"
                  : "border-neutral-800 hover:border-[#ffcc00]/40 bg-black"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    t.status === "RUNNING"
                      ? "bg-[#ffcc00] animate-ping"
                      : t.status === "EXPIRED"
                      ? "bg-red-600 animate-bounce"
                      : "bg-neutral-600"
                  }`}
                />
                <div>
                  <div className="font-bold text-sm tracking-wide">{t.label}</div>
                  <div className="text-[10px] text-neutral-400">SOUND: {t.zeroSound.toUpperCase()}</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xl font-bold tracking-widest">{formatHMS(t.remainingSec)}</span>
                {t.status !== "RUNNING" ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExecuteTimer(t.id);
                    }}
                    className="text-xs px-2.5 py-1 bg-[#ffcc00] text-black font-bold uppercase hover:bg-[#ffd633]"
                  >
                    RUN
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleHoldTimer(t.id);
                    }}
                    className="text-xs px-2.5 py-1 bg-red-600 text-white font-bold uppercase hover:bg-red-500"
                  >
                    HOLD
                  </button>
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPickerMode("timer");
                    setEditingItemId(t.id);
                    setPickerOpen(true);
                  }}
                  className="text-xs px-2 py-1 border border-[#ffcc00]/60 hover:bg-[#ffcc00]/20"
                >
                  EDIT
                </button>

                {timers.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setTimers(timers.filter((x) => x.id !== t.id));
                      if (selectedTimerId === t.id) setSelectedTimerId(timers[0]?.id || "");
                    }}
                    className="text-xs px-1.5 py-1 text-red-500 hover:bg-red-950/40"
                  >
                    DEL
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Tactical Alarms Queue (Bangkok Time) */}
      <section className="w-full max-w-4xl border border-[#ffcc00]/40 bg-black/90 p-4 mb-4 rounded">
        <div className="flex items-center justify-between border-b border-[#ffcc00]/30 pb-2 mb-3">
          <h2 className="text-sm font-bold tracking-widest uppercase text-[#ffcc00]">
            TACTICAL ALARMS (BANGKOK TIME)
          </h2>
          <button
            onClick={() => {
              const newA: TacticalAlarm = {
                id: `alarm-${Date.now()}`,
                label: `TASK ${alarms.length + 1}`,
                timeStr: "08:00",
                days: [1, 2, 3, 4, 5],
                armed: true,
                zeroSound: "alarm",
              };
              setAlarms([...alarms, newA]);
            }}
            className="text-xs px-2 py-1 bg-[#ffcc00]/20 hover:bg-[#ffcc00] hover:text-black border border-[#ffcc00] font-bold transition-colors"
          >
            + NEW ALARM
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {alarms.map((alarm) => (
            <div
              key={alarm.id}
              className={`p-2.5 border flex flex-wrap items-center justify-between gap-2 bg-black ${
                ringingAlarmId === alarm.id
                  ? "border-red-600 bg-red-950/30 animate-pulse"
                  : alarm.armed
                  ? "border-[#ffcc00]/60"
                  : "border-neutral-800 opacity-60"
              }`}
            >
              <div>
                <div className="font-bold text-sm tracking-wide flex items-center gap-2">
                  <span>{alarm.label}</span>
                  {ringingAlarmId === alarm.id && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-red-600 text-white font-bold animate-ping">
                      RINGING
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-neutral-400">
                  DAYS: {alarm.days.length === 7 ? "DAILY" : alarm.days.length === 5 && !alarm.days.includes(0) ? "MON-FRI" : `${alarm.days.length} DAYS/WK`} • SOUND: {alarm.zeroSound.toUpperCase()}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-2xl font-black tracking-widest">{alarm.timeStr || "08:00"}</span>

                {ringingAlarmId === alarm.id ? (
                  <button
                    onClick={() => {
                      setRingingAlarmId(null);
                      CTUAudio.stopAll();
                    }}
                    className="text-xs px-3 py-1 bg-red-600 text-white font-bold uppercase hover:bg-red-500 animate-bounce"
                  >
                    STOP ALARM
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setAlarms(
                        alarms.map((a) => (a.id === alarm.id ? { ...a, armed: !a.armed } : a))
                      );
                    }}
                    className={`text-xs px-2.5 py-1 font-bold uppercase ${
                      alarm.armed
                        ? "bg-[#ffcc00] text-black hover:bg-[#ffd633]"
                        : "border border-neutral-700 text-neutral-500 hover:border-neutral-500"
                    }`}
                  >
                    {alarm.armed ? "ARMED" : "STANDBY"}
                  </button>
                )}

                <button
                  onClick={() => {
                    setPickerMode("alarm");
                    setEditingItemId(alarm.id);
                    setPickerOpen(true);
                  }}
                  className="text-xs px-2 py-1 border border-[#ffcc00]/60 hover:bg-[#ffcc00]/20"
                >
                  EDIT
                </button>

                {alarms.length > 1 && (
                  <button
                    onClick={() => setAlarms(alarms.filter((x) => x.id !== alarm.id))}
                    className="text-xs px-1.5 py-1 text-red-500 hover:bg-red-950/40"
                  >
                    DEL
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* v74 Exact 10->0 Countdown Takeover Modal Overlay */}
      {takeoverOpen && (
        <div
          onClick={cancelTakeoverCountdown}
          className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-6 cursor-pointer select-none"
        >
          <div
            className={`w-full max-w-lg p-8 rounded-lg border-4 flex flex-col items-center justify-center transition-all ${
              takeoverIsCrimson
                ? "border-red-600 bg-red-950/20 shadow-[0_0_50px_rgba(255,0,0,0.8)]"
                : "border-[#ffcc00] bg-black shadow-[0_0_50px_rgba(255,204,0,0.5)]"
            }`}
          >
            <div
              className={`text-xs font-bold uppercase tracking-widest mb-4 ${
                takeoverIsCrimson ? "text-red-500 animate-pulse" : "text-[#ffcc00]/70"
              }`}
            >
              CRITICAL COUNTDOWN // {takeoverLabel}
            </div>

            <div
              className={`text-8xl sm:text-9xl font-black tracking-widest transition-colors ${
                takeoverIsCrimson
                  ? "text-red-600 drop-shadow-[0_0_30px_rgba(255,0,0,0.9)] scale-110"
                  : "text-[#ffcc00] drop-shadow-[0_0_25px_rgba(255,204,0,0.8)]"
              }`}
            >
              {takeoverDigit}
            </div>

            <div
              className={`text-xs tracking-widest mt-6 uppercase ${
                takeoverIsCrimson ? "text-red-400 animate-bounce" : "text-[#ffcc00]/60"
              }`}
            >
              [ TAP SCREEN TO CANCEL TAKEOVER ]
            </div>
          </div>
        </div>
      )}

      {/* Samsung-Style Drum Time Picker Modal */}
      {pickerOpen && (
        <SamsungTimePicker
          isOpen={pickerOpen}
          mode={pickerMode}
          initialDurationSec={
            pickerMode === "timer"
              ? timers.find((t) => t.id === editingItemId)?.durationSec || 25 * 60
              : 0
          }
          initialTimeStr={
            pickerMode === "alarm"
              ? alarms.find((a) => a.id === editingItemId)?.timeStr || "08:00"
              : "08:00"
          }
          initialDays={
            pickerMode === "alarm"
              ? alarms.find((a) => a.id === editingItemId)?.days || [1, 2, 3, 4, 5]
              : [0, 1, 2, 3, 4, 5, 6]
          }
          onConfirm={(result) => {
            if (pickerMode === "timer" && editingItemId) {
              const rawSec = typeof result.totalSec === "number" && !isNaN(result.totalSec)
                ? result.totalSec
                : typeof result.totalSeconds === "number" && !isNaN(result.totalSeconds)
                ? result.totalSeconds
                : ((result.hours || 0) * 3600 + (result.minutes || 0) * 60 + (result.seconds || 0));
              const safeSec = Math.max(1, !isNaN(rawSec) && rawSec > 0 ? rawSec : 25 * 60);

              setTimers((prev) =>
                prev.map((t) =>
                  t.id === editingItemId
                    ? { ...t, durationSec: safeSec, remainingSec: safeSec, status: "READY" }
                    : t
                )
              );
            } else if (pickerMode === "alarm" && editingItemId) {
              const timeStr = result.timeStr || `${String(result.hours || 0).padStart(2, "0")}:${String(result.minutes || 0).padStart(2, "0")}`;
              const days = result.days && result.days.length > 0 ? result.days : [1, 2, 3, 4, 5];

              setAlarms((prev) =>
                prev.map((a) =>
                  a.id === editingItemId
                    ? { ...a, timeStr, days }
                    : a
                )
              );
            }
            setPickerOpen(false);
            setEditingItemId(null);
          }}
          onCancel={() => {
            setPickerOpen(false);
            setEditingItemId(null);
          }}
        />
      )}
    </div>
  );
}
