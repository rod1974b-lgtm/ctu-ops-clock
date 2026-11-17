// src/routes/index.tsx — FULL DROP-IN REPLACEMENT FILE
import React, { useState, useEffect, useRef, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SamsungTimePicker } from "@/components/samsung-time-picker";
import { CTUAudio, ZeroSoundType } from "@/lib/ctu-audio";
import {
  initBackgroundAlerts,
  scheduleLocalAlert,
  cancelLocalAlert,
  updateLockscreenHUD,
  clearLockscreenHUD,
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
  status: "READY" | "RUNNING" | "PAUSED" | "HOLD" | "EXPIRED";
  zeroSound: ZeroSoundType;
};

export type AlarmItem = {
  id: string;
  label: string;
  timeStr: string; // HH:mm
  days: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  armed: boolean;
  zeroSound: ZeroSoundType;
};

type PipMode = "ALL" | "TIMERS" | "ALARMS";

const INITIAL_TIMERS: TimerItem[] = [
  { id: "timer-1", label: "TACTICAL SPRINT", durationSec: 25 * 60, remainingSec: 25 * 60, status: "READY", zeroSound: "theme" },
  { id: "timer-2", label: "FIELD INTERROGATION", durationSec: 15 * 60, remainingSec: 15 * 60, status: "READY", zeroSound: "theme" },
  { id: "timer-3", label: "SATELLITE PASS", durationSec: 45 * 60, remainingSec: 45 * 60, status: "READY", zeroSound: "theme" },
];

const INITIAL_ALARMS: AlarmItem[] = [
  { id: "alarm-1", label: "MANDATORY BRIEFING", timeStr: "06:00", days: [1, 2, 3, 4, 5], armed: true, zeroSound: "theme" },
  { id: "alarm-2", label: "PERIMETER CHECK", timeStr: "12:00", days: [0, 1, 2, 3, 4, 5, 6], armed: false, zeroSound: "boom" },
  { id: "alarm-3", label: "INTEL HANDOFF", timeStr: "18:00", days: [1, 2, 3, 4, 5], armed: true, zeroSound: "theme" },
];

const PRESETS = [
  { label: "TACTICAL SPRINT", sec: 25 * 60 },
  { label: "INTERROGATION", sec: 15 * 60 },
  { label: "SATELLITE PASS", sec: 45 * 60 },
  { label: "FIELD STAND-DOWN", sec: 5 * 60 },
  { label: "QUICK 60 SEC", sec: 60 },
  { label: "CRISIS 10 SEC", sec: 10 },
];

function formatHMS(sec: number): string {
  const safe = typeof sec === "number" && !isNaN(sec) ? Math.max(0, Math.floor(sec)) : 0;
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function CTUTacticalOpsTerminal() {
  // Clocks State
  const [currentTimeBangkok, setCurrentTimeBangkok] = useState<string>("00:00:00");
  const [currentTimeZulu, setCurrentTimeZulu] = useState<string>("00:00:00");
  const [currentDateStr, setCurrentDateStr] = useState<string>("CTU // ACTIVE");
  const [blinkColon, setBlinkColon] = useState(true);

  // Queues State
  const [timers, setTimers] = useState<TimerItem[]>(INITIAL_TIMERS);
  const [alarms, setAlarms] = useState<AlarmItem[]>(INITIAL_ALARMS);
  const [selectedTimerId, setSelectedTimerId] = useState<string>("timer-1");

  // Samsung Picker State
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<{ type: "timer" | "alarm"; id: string } | null>(null);

  // v74 Takeover State
  const [takeoverOpen, setTakeoverOpen] = useState(false);
  const [takeoverDigit, setTakeoverDigit] = useState(10);
  const [takeoverLabel, setTakeoverLabel] = useState("TACTICAL DEADLINE");
  const [takeoverIsCrimson, setTakeoverIsCrimson] = useState(false);
  const takeoverIntervalRef = useRef<number | null>(null);
  const takeoverActiveRef = useRef(false);
  const takeoverCallbackRef = useRef<(() => void) | null>(null);

  // Ringing / Expired Audio Banner State
  const [ringingAlarmId, setRingingAlarmId] = useState<string | null>(null);
  const [activeAlarmLabel, setActiveAlarmLabel] = useState<string>("");

  // System & Wake Lock State
  const [osAlertsEnabled, setOsAlertsEnabled] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [wirePhoneClock, setWirePhoneClock] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Picture-in-Picture Multi-Slot HUD Canvas & Video elements
  const pipCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const [isPipActive, setIsPipActive] = useState(false);
  const [pipMode, setPipMode] = useState<PipMode>("ALL");
  const pipModeRef = useRef<PipMode>("ALL");

  useEffect(() => {
    pipModeRef.current = pipMode;
  }, [pipMode]);

  // Deadlines map for running timers
  const timerDeadlinesRef = useRef<Map<string, number>>(new Map());

  // 1. Mount & Initialization (Sanitize any stale localStorage)
  useEffect(() => {
    initBackgroundAlerts();

    try {
      const savedTimers = localStorage.getItem("ctu_timers_v2");
      if (savedTimers) {
        const parsed = JSON.parse(savedTimers);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const validated = parsed.map((t) => {
            const safeDur = typeof t.durationSec === "number" && !isNaN(t.durationSec) && t.durationSec > 0 ? t.durationSec : 25 * 60;
            return {
              id: t.id || `timer-${Date.now()}`,
              label: t.label || "TACTICAL SPRINT",
              durationSec: safeDur,
              remainingSec: safeDur,
              status: "READY" as const,
              zeroSound: ["theme", "voice", "boom", "alarm", "ctu_beep", "stinger"].includes(t?.zeroSound) ? t.zeroSound : "theme",
            };
          });
          setTimers(validated);
        }
      }
    } catch {}

    try {
      const savedAlarms = localStorage.getItem("ctu_alarms_v2");
      if (savedAlarms) {
        const parsed = JSON.parse(savedAlarms);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const validated = parsed.map((a) => {
            const validTime = typeof a.timeStr === "string" && a.timeStr.includes(":") ? a.timeStr : "06:00";
            return {
              id: a.id || `alarm-${Date.now()}`,
              label: a.label || "TACTICAL ALARM",
              timeStr: validTime,
              days: Array.isArray(a.days) && a.days.length > 0 ? a.days : [1, 2, 3, 4, 5],
              armed: typeof a.armed === "boolean" ? a.armed : true,
              zeroSound: ["theme", "voice", "boom", "alarm", "ctu_beep", "stinger"].includes(a?.zeroSound) ? a.zeroSound : "theme",
            };
          });
          setAlarms(validated);
        }
      }
    } catch {}

    if ("Notification" in window && Notification.permission === "granted") {
      setOsAlertsEnabled(true);
    }
  }, []);

  // Save changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("ctu_timers_v2", JSON.stringify(timers));
    } catch {}
  }, [timers]);

  useEffect(() => {
    try {
      localStorage.setItem("ctu_alarms_v2", JSON.stringify(alarms));
    } catch {}
  }, [alarms]);

  // Request & Maintain Wake Lock during operations
  const requestWakeLock = useCallback(async () => {
    if ("wakeLock" in navigator && !wakeLockRef.current) {
      try {
        const lock = await navigator.wakeLock.request("screen");
        wakeLockRef.current = lock;
        setWakeLockActive(true);
        lock.addEventListener("release", () => {
          wakeLockRef.current = null;
          setWakeLockActive(false);
        });
      } catch {
        // WakeLock rejected
      }
    }
  }, []);

  useEffect(() => {
    const hasRunning = timers.some((t) => t.status === "RUNNING");
    if (hasRunning) {
      requestWakeLock();
    } else if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
      setWakeLockActive(false);
    }
  }, [timers, requestWakeLock]);

  /**
   * Draw High-Density Multi-Slot Picture-in-Picture Tactical HUD (Canvas 560 x 340)
   * Supports 6+ active timers and 6+ armed alarms simultaneously or in dedicated modes
   */
  const drawPipHud = useCallback(
    (activeTimersList: TimerItem[], armedAlarmsList: AlarmItem[], isEmergency = false, modeOverride?: PipMode) => {
      const canvas = pipCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const currentMode = modeOverride || pipModeRef.current;
      const w = canvas.width;
      const h = canvas.height;

      // Dark tactical canvas background
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, w, h);

      // Outer tactical threat border
      ctx.strokeStyle = isEmergency ? "#ff0000" : "#ffcc00";
      ctx.lineWidth = 4;
      ctx.strokeRect(3, 3, w - 6, h - 6);

      // Top Tactical Status Bar
      ctx.fillStyle = isEmergency ? "rgba(255, 0, 0, 0.25)" : "rgba(255, 204, 0, 0.15)";
      ctx.fillRect(5, 5, w - 10, 32);

      ctx.fillStyle = isEmergency ? "#ff0000" : "#ffcc00";
      ctx.font = "bold 13px Consolas, monospace";
      ctx.textAlign = "left";
      const headerTitle =
        currentMode === "TIMERS"
          ? "CTU // TIMERS MONITOR [6+ SLOTS]"
          : currentMode === "ALARMS"
          ? "CTU // ALARMS MONITOR [6+ SLOTS]"
          : `CTU // ${isEmergency ? "CRITICAL THREAT" : "OPERATIONAL HUD"}`;
      ctx.fillText(headerTitle, 12, 26);

      ctx.textAlign = "right";
      ctx.fillText(`ZULU: ${currentTimeZulu}`, w - 12, 26);

      let currentY = 56;

      // MODE 1: TIMERS ONLY (Displays up to 8 active timers in dense rows)
      if (currentMode === "TIMERS") {
        ctx.fillStyle = "#888888";
        ctx.font = "bold 11px Consolas, monospace";
        ctx.textAlign = "left";
        ctx.fillText(`--- ACTIVE TIMERS QUEUE (${activeTimersList.length}) ---`, 12, currentY);
        currentY += 20;

        if (activeTimersList.length === 0) {
          ctx.fillStyle = "#555555";
          ctx.font = "12px Consolas, monospace";
          ctx.fillText("NO TIMERS RUNNING [STANDBY]", 12, currentY);
        } else {
          activeTimersList.slice(0, 8).forEach((t, idx) => {
            const isCrim = t.remainingSec <= 10;
            ctx.fillStyle = isCrim ? "#ff0000" : "#ffcc00";
            ctx.font = "bold 12px Consolas, monospace";
            ctx.textAlign = "left";
            const shortLabel = t.label.length > 22 ? t.label.substring(0, 22) + ".." : t.label;
            ctx.fillText(`${idx + 1}. ▶ ${shortLabel}`, 12, currentY);

            ctx.textAlign = "right";
            ctx.font = "bold 14px Consolas, monospace";
            ctx.fillText(formatHMS(t.remainingSec), w - 12, currentY);

            currentY += 28;
          });
        }
        return;
      }

      // MODE 2: ALARMS ONLY (Displays up to 8 armed alarms in dense rows)
      if (currentMode === "ALARMS") {
        ctx.fillStyle = "#888888";
        ctx.font = "bold 11px Consolas, monospace";
        ctx.textAlign = "left";
        ctx.fillText(`--- ARMED ALARMS (BANGKOK) (${armedAlarmsList.length}) ---`, 12, currentY);
        currentY += 20;

        if (armedAlarmsList.length === 0) {
          ctx.fillStyle = "#555555";
          ctx.font = "12px Consolas, monospace";
          ctx.fillText("NO ARMED ALARMS", 12, currentY);
        } else {
          armedAlarmsList.slice(0, 8).forEach((a, idx) => {
            ctx.fillStyle = "#ffcc00";
            ctx.font = "bold 12px Consolas, monospace";
            ctx.textAlign = "left";
            const shortLabel = a.label.length > 24 ? a.label.substring(0, 24) + ".." : a.label;
            ctx.fillText(`${idx + 1}. ⏱ ${shortLabel}`, 12, currentY);

            ctx.textAlign = "right";
            ctx.font = "bold 14px Consolas, monospace";
            ctx.fillText(a.timeStr, w - 12, currentY);

            currentY += 28;
          });
        }
        return;
      }

      // MODE 3: ALL / DUAL QUEUE (Up to 4 active timers + 4 armed alarms)
      ctx.fillStyle = "#888888";
      ctx.font = "bold 11px Consolas, monospace";
      ctx.textAlign = "left";
      ctx.fillText(`--- ACTIVE TIMERS (${activeTimersList.length}) ---`, 12, currentY);
      currentY += 18;

      if (activeTimersList.length === 0) {
        ctx.fillStyle = "#555555";
        ctx.font = "12px Consolas, monospace";
        ctx.fillText("NO TIMERS ACTIVE [STANDBY]", 12, currentY);
        currentY += 22;
      } else {
        activeTimersList.slice(0, 4).forEach((t) => {
          const isCrim = t.remainingSec <= 10;
          ctx.fillStyle = isCrim ? "#ff0000" : "#ffcc00";
          ctx.font = "bold 12px Consolas, monospace";
          ctx.textAlign = "left";
          const shortLabel = t.label.length > 20 ? t.label.substring(0, 20) + ".." : t.label;
          ctx.fillText(`▶ ${shortLabel}`, 12, currentY);

          ctx.textAlign = "right";
          ctx.font = "bold 14px Consolas, monospace";
          ctx.fillText(formatHMS(t.remainingSec), w - 12, currentY);

          currentY += 22;
        });
      }

      currentY += 4;
      ctx.strokeStyle = "rgba(255, 204, 0, 0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(10, currentY);
      ctx.lineTo(w - 10, currentY);
      ctx.stroke();
      currentY += 16;

      ctx.fillStyle = "#888888";
      ctx.font = "bold 11px Consolas, monospace";
      ctx.textAlign = "left";
      ctx.fillText(`--- ARMED ALARMS (${armedAlarmsList.length}) ---`, 12, currentY);
      currentY += 18;

      if (armedAlarmsList.length === 0) {
        ctx.fillStyle = "#555555";
        ctx.font = "12px Consolas, monospace";
        ctx.fillText("NO ALARMS ARMED", 12, currentY);
      } else {
        armedAlarmsList.slice(0, 4).forEach((a) => {
          ctx.fillStyle = "#ffcc00";
          ctx.font = "bold 12px Consolas, monospace";
          ctx.textAlign = "left";
          const shortLabel = a.label.length > 22 ? a.label.substring(0, 22) + ".." : a.label;
          ctx.fillText(`⏱ ${shortLabel}`, 12, currentY);

          ctx.textAlign = "right";
          ctx.font = "bold 13px Consolas, monospace";
          ctx.fillText(a.timeStr, w - 12, currentY);

          currentY += 20;
        });
      }
    },
    [currentTimeZulu]
  );

  /**
   * v74 Takeover Countdown Sequence:
   * Opens full-screen modal, plays countdown audio, ticks, and transitions to Zero Theme
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

    // Start 24 Alarm Countdown audio track
    CTUAudio.startCountdownAudio();
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

        // Stop countdown track and start signature 24 At Zero Theme
        CTUAudio.stopCountdownAudio();
        CTUAudio.playZeroTheme();

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
      } catch {}

      // Update Running Timers
      setTimers((prevTimers) => {
        let hasActive = false;
        let hudRemaining = 0;
        let hudLabel = "";
        let isEmergency = false;

        const updated = prevTimers.map((timer) => {
          if (timer.status !== "RUNNING") return timer;

          const deadline = timerDeadlinesRef.current.get(timer.id);
          const rawRemaining = deadline ? Math.ceil((deadline - Date.now()) / 1000) : timer.remainingSec - 1;
          const remaining = isNaN(rawRemaining) ? 0 : Math.max(0, rawRemaining);

          hasActive = true;
          hudRemaining = remaining;
          hudLabel = timer.label;
          if (remaining <= 10) isEmergency = true;

          // v74 Exact 10-Second Transition to Takeover
          if (remaining === 10 && !takeoverActiveRef.current) {
            timerDeadlinesRef.current.delete(timer.id);
            window.setTimeout(() => {
              launchTakeoverCountdown(10, timer.label, () => {
                setActiveAlarmLabel(`TIMER EXPIRED: ${timer.label}`);
                setRingingAlarmId(timer.id);
                CTUAudio.playZeroTheme();
                setTimers((current) =>
                  current.map((t) => (t.id === timer.id ? { ...t, remainingSec: 0, status: "EXPIRED" } : t))
                );
              });
            }, 50);
            return { ...timer, remainingSec: 10, status: "HOLD" as const };
          }

          // Zero hit directly
          if (remaining <= 0) {
            timerDeadlinesRef.current.delete(timer.id);
            setActiveAlarmLabel(`TIMER EXPIRED: ${timer.label}`);
            setRingingAlarmId(timer.id);
            CTUAudio.playZeroTheme();
            return { ...timer, remainingSec: 0, status: "EXPIRED" as const };
          }

          return { ...timer, remainingSec: remaining };
        });

        // Update High-Density Multi-Slot Picture-in-Picture HUD
        const activeList = updated.filter((t) => t.status === "RUNNING" || t.status === "HOLD");
        const armedAlarms = alarms.filter((a) => a.armed);
        drawPipHud(activeList, armedAlarms, isEmergency);

        if (hasActive) {
          const formatted = formatHMS(hudRemaining);
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

        const diffSec = (aH - bkkHour) * 3600 + (aM - bkkMin) * 60 - bkkSec;

        // 10 Seconds Before Alarm -> Launch Takeover Countdown
        if (diffSec === 10 && !takeoverActiveRef.current) {
          launchTakeoverCountdown(10, `ALARM: ${alarm.label}`, () => {
            setRingingAlarmId(alarm.id);
            setActiveAlarmLabel(`ALARM TRIGGERED: ${alarm.label}`);
            CTUAudio.playZeroTheme();
          });
        }

        // Direct hit if opened at exact minute
        if (diffSec === 0 && !takeoverActiveRef.current && ringingAlarmId !== alarm.id) {
          setRingingAlarmId(alarm.id);
          setActiveAlarmLabel(`ALARM TRIGGERED: ${alarm.label}`);
          CTUAudio.playZeroTheme();
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [alarms, drawPipHud, launchTakeoverCountdown, ringingAlarmId]);

  // Execute Timer Handler
  const handleExecuteTimer = (id: string) => {
    CTUAudio.unlock();
    CTUAudio.playChirp();

    setTimers((prev) =>
      prev.map((timer) => {
        if (timer.id !== id) return timer;

        const rawStart = timer.remainingSec > 0 ? timer.remainingSec : timer.durationSec;
        const startingSec = !isNaN(rawStart) && rawStart > 0 ? rawStart : 25 * 60;

        if (startingSec <= 10) {
          window.setTimeout(() => {
            launchTakeoverCountdown(startingSec, timer.label, () => {
              setActiveAlarmLabel(`TIMER EXPIRED: ${timer.label}`);
              setRingingAlarmId(id);
              CTUAudio.playZeroTheme();
              setTimers((current) =>
                current.map((t) => (t.id === id ? { ...t, remainingSec: 0, status: "EXPIRED" } : t))
              );
            });
          }, 80);
          return { ...timer, remainingSec: startingSec, status: "HOLD" };
        }

        const deadline = Date.now() + startingSec * 1000;
        timerDeadlinesRef.current.set(id, deadline);

        if (osAlertsEnabled) {
          scheduleLocalAlert(id, timer.label, deadline);
        }

        return { ...timer, remainingSec: startingSec, status: "RUNNING" };
      })
    );
  };

  const handlePauseTimer = (id: string) => {
    timerDeadlinesRef.current.delete(id);
    cancelLocalAlert(id);
    setTimers((prev) => prev.map((t) => (t.id === id ? { ...t, status: "PAUSED" } : t)));
  };

  const handleStopAndResetTimer = (id: string) => {
    timerDeadlinesRef.current.delete(id);
    cancelLocalAlert(id);
    if (ringingAlarmId === id) {
      setRingingAlarmId(null);
      setActiveAlarmLabel("");
      CTUAudio.stopAll();
    }
    setTimers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, remainingSec: t.durationSec, status: "READY" } : t))
    );
  };

  const handleSilenceActiveAlarm = () => {
    setRingingAlarmId(null);
    setActiveAlarmLabel("");
    CTUAudio.stopAll();
  };

  const handleSelectPreset = (sec: number, label: string) => {
    CTUAudio.unlock();
    CTUAudio.playChirp();
    const safeSec = !isNaN(sec) && sec > 0 ? sec : 25 * 60;
    setTimers((prev) =>
      prev.map((t) =>
        t.id === selectedTimerId
          ? { ...t, label, durationSec: safeSec, remainingSec: safeSec, status: "READY" }
          : t
      )
    );
  };

  const handleOpenPickerForTimer = (id: string) => {
    setSelectedTimerId(id);
    setPickerTarget({ type: "timer", id });
    setPickerOpen(true);
  };

  const handleOpenPickerForAlarm = (id: string) => {
    setPickerTarget({ type: "alarm", id });
    setPickerOpen(true);
  };

  const handlePickerConfirm = (result: {
    totalSeconds?: number;
    totalSec?: number;
    hours?: number;
    minutes?: number;
    seconds?: number;
    timeStr?: string;
    days?: number[];
  }) => {
    if (!pickerTarget) return;

    if (pickerTarget.type === "timer") {
      let resolvedSec = 0;
      if (typeof result.totalSeconds === "number" && !isNaN(result.totalSeconds) && result.totalSeconds > 0) {
        resolvedSec = result.totalSeconds;
      } else if (typeof result.totalSec === "number" && !isNaN(result.totalSec) && result.totalSec > 0) {
        resolvedSec = result.totalSec;
      } else if (typeof result.hours === "number" || typeof result.minutes === "number" || typeof result.seconds === "number") {
        resolvedSec = (result.hours || 0) * 3600 + (result.minutes || 0) * 60 + (result.seconds || 0);
      } else if (result.timeStr && result.timeStr.includes(":")) {
        const parts = result.timeStr.split(":").map(Number);
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          resolvedSec = parts[0] * 3600 + parts[1] * 60;
        }
      }

      if (resolvedSec <= 0) resolvedSec = 25 * 60;

      setTimers((prev) =>
        prev.map((t) =>
          t.id === pickerTarget.id
            ? { ...t, durationSec: resolvedSec, remainingSec: resolvedSec, status: "READY" }
            : t
        )
      );
    } else {
      const validTime = typeof result.timeStr === "string" && result.timeStr.includes(":") ? result.timeStr : "06:00";
      const validDays = Array.isArray(result.days) && result.days.length > 0 ? result.days : [1, 2, 3, 4, 5];

      setAlarms((prev) =>
        prev.map((a) => (a.id === pickerTarget.id ? { ...a, timeStr: validTime, days: validDays } : a))
      );
    }

    setPickerOpen(false);
    setPickerTarget(null);
  };

  // Toggle Picture-in-Picture Multi-Slot HUD with specified mode (TIMERS or ALARMS)
  const handleTogglePipWithMode = async (targetMode: PipMode) => {
    try {
      const canvas = pipCanvasRef.current;
      const video = pipVideoRef.current;
      if (!canvas || !video) return;

      // If PiP is already active with the same mode, close it
      if (document.pictureInPictureElement && pipMode === targetMode) {
        await document.exitPictureInPicture();
        setIsPipActive(false);
        return;
      }

      // Update mode
      setPipMode(targetMode);
      pipModeRef.current = targetMode;

      const activeList = timers.filter((t) => t.status === "RUNNING" || t.status === "HOLD");
      const armedAlarms = alarms.filter((a) => a.armed);
      drawPipHud(activeList, armedAlarms, false, targetMode);

      if (!video.srcObject) {
        const stream = canvas.captureStream(10);
        video.srcObject = stream;
        await video.play();
      }

      if (!document.pictureInPictureElement) {
        await video.requestPictureInPicture();
        setIsPipActive(true);

        video.addEventListener("leavepictureinpicture", () => {
          setIsPipActive(false);
        });
      }
    } catch {
      // PiP unavailable or cancelled
    }
  };

  // OS Alerts Permission Request
  const handleLinkOSAlerts = async () => {
    if (!("Notification" in window)) return;
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        setOsAlertsEnabled(true);
      }
    } catch {}
  };

  const handleSyncSamsungClock = () => {
    setWirePhoneClock((w) => !w);
  };

  const activeTimer = timers.find((t) => t.id === selectedTimerId) || timers[0] || INITIAL_TIMERS[0];

  return (
    <div className="min-h-screen bg-black text-[#ffcc00] font-mono selection:bg-[#ffcc00] selection:text-black p-2 sm:p-4 md:p-6 flex flex-col items-center select-none">
      {/* Hidden elements for Picture-in-Picture Multi-Slot HUD Streaming (560x340 for 6+ items) */}
      <canvas ref={pipCanvasRef} width={560} height={340} className="hidden" />
      <video ref={pipVideoRef} muted playsInline className="hidden" />

      {/* Emergency Active Audio Banner */}
      {ringingAlarmId && (
        <div className="w-full max-w-4xl bg-red-950 border-2 border-red-500 text-white p-3 mb-4 rounded flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <div className="font-black text-sm tracking-wider text-red-400">CRITICAL TARGET REACHED</div>
              <div className="text-base font-bold">{activeAlarmLabel || "AT-ZERO THEME PLAYING"}</div>
            </div>
          </div>
          <button
            onClick={handleSilenceActiveAlarm}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase tracking-widest rounded border border-white/40 shadow-lg"
          >
            SILENCE / STOP ALARM
          </button>
        </div>
      )}

      {/* Top Header & Mobile Failsafe Controls */}
      <header className="w-full max-w-4xl border border-[#ffcc00]/40 bg-black/90 p-3 mb-4 rounded shadow-[0_0_15px_rgba(255,204,0,0.15)] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-[#ffcc00] animate-pulse" />
          <h1 className="text-base md:text-lg font-black tracking-widest text-[#ffcc00]">
            CTU // LOS ANGELES SUB-STATION
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Dedicated PiP Timers Button */}
          <button
            onClick={() => handleTogglePipWithMode("TIMERS")}
            className={`text-xs px-2.5 py-1 font-bold border transition-colors ${
              isPipActive && pipMode === "TIMERS"
                ? "bg-[#ffcc00] text-black border-[#ffcc00]"
                : "border-[#ffcc00]/60 hover:bg-[#ffcc00]/20 text-[#ffcc00]"
            }`}
          >
            {isPipActive && pipMode === "TIMERS" ? "[PIP TIMERS: ON]" : "PIP TIMERS (6+)"}
          </button>

          {/* Dedicated PiP Alarms Button */}
          <button
            onClick={() => handleTogglePipWithMode("ALARMS")}
            className={`text-xs px-2.5 py-1 font-bold border transition-colors ${
              isPipActive && pipMode === "ALARMS"
                ? "bg-[#ffcc00] text-black border-[#ffcc00]"
                : "border-[#ffcc00]/60 hover:bg-[#ffcc00]/20 text-[#ffcc00]"
            }`}
          >
            {isPipActive && pipMode === "ALARMS" ? "[PIP ALARMS: ON]" : "PIP ALARMS (6+)"}
          </button>

          <button
            onClick={handleSyncSamsungClock}
            className="text-xs px-2.5 py-1 font-bold border border-[#ffcc00]/60 hover:bg-[#ffcc00]/20 text-[#ffcc00]"
          >
            {wirePhoneClock ? "[PHONE SYNC: ON]" : "WIRE PHONE CLOCK"}
          </button>

          <button
            onClick={handleLinkOSAlerts}
            className="text-xs px-2.5 py-1 font-bold border border-[#ffcc00]/60 hover:bg-[#ffcc00]/20 text-[#ffcc00]"
          >
            {osAlertsEnabled ? "[OS NOTIFICATIONS: ARMED]" : "ARM OS ALERTS"}
          </button>
        </div>
      </header>

      {/* Synchronized Tactical Operational Clocks */}
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Bangkok Operational Clock */}
        <div className="border border-[#ffcc00]/50 bg-black/80 p-4 rounded text-center relative overflow-hidden">
          <div className="text-xs tracking-widest text-[#ffcc00]/70 mb-1">LOCAL THEATER // BANGKOK (ICT / UTC+7)</div>
          <div className="text-4xl md:text-5xl font-black tracking-widest text-[#ffcc00] tabular-nums">
            {currentTimeBangkok.split(":").map((part, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span className={blinkColon ? "opacity-100" : "opacity-20"}>:</span>}
                <span>{part}</span>
              </React.Fragment>
            ))}
          </div>
          <div className="text-[11px] text-[#ffcc00]/60 mt-1">{currentDateStr}</div>
        </div>

        {/* Zulu / UTC Synchronization Clock */}
        <div className="border border-[#ffcc00]/50 bg-black/80 p-4 rounded text-center relative overflow-hidden">
          <div className="text-xs tracking-widest text-[#ffcc00]/70 mb-1">GLOBAL SYNCHRONIZATION // ZULU (UTC)</div>
          <div className="text-4xl md:text-5xl font-black tracking-widest text-[#ffcc00] tabular-nums">
            {currentTimeZulu.split(":").map((part, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span className={blinkColon ? "opacity-100" : "opacity-20"}>:</span>}
                <span>{part}</span>
              </React.Fragment>
            ))}
          </div>
          <div className="text-[11px] text-[#ffcc00]/60 mt-1">STATUS: OPERATIONAL PROTOCOL ENGAGED</div>
        </div>
      </div>

      {/* Main Focus Tactical Countdown Display */}
      <div className="w-full max-w-4xl border-2 border-[#ffcc00] bg-black p-6 rounded-lg mb-6 text-center shadow-[0_0_30px_rgba(255,204,0,0.2)]">
        <div className="text-xs md:text-sm font-bold tracking-widest text-[#ffcc00]/80 mb-2">
          FOCUS TARGET: {activeTimer.label.toUpperCase()} [{activeTimer.status}]
        </div>

        <div className="text-6xl sm:text-7xl md:text-8xl font-black tracking-widest text-[#ffcc00] my-2 tabular-nums">
          {formatHMS(activeTimer.remainingSec)}
        </div>

        {/* Quick Tactical Preset Arming Chips */}
        <div className="flex flex-wrap justify-center gap-1.5 my-4">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => handleSelectPreset(p.sec, p.label)}
              className="text-[11px] px-2.5 py-1 bg-black border border-[#ffcc00]/50 hover:bg-[#ffcc00] hover:text-black text-[#ffcc00] transition-colors rounded"
            >
              {p.label} ({Math.round(p.sec / 60)}M)
            </button>
          ))}
        </div>

        {/* Execution Controls */}
        <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
          {activeTimer.status !== "RUNNING" && (
            <button
              onClick={() => handleExecuteTimer(activeTimer.id)}
              className="px-6 py-2 bg-[#ffcc00] text-black font-black text-sm uppercase tracking-widest hover:bg-[#ffdd33] rounded shadow-[0_0_15px_rgba(255,204,0,0.4)]"
            >
              EXECUTE TIMER
            </button>
          )}

          {activeTimer.status === "RUNNING" && (
            <button
              onClick={() => handlePauseTimer(activeTimer.id)}
              className="px-6 py-2 bg-yellow-600 text-black font-black text-sm uppercase tracking-widest hover:bg-yellow-500 rounded"
            >
              HOLD (PAUSE)
            </button>
          )}

          <button
            onClick={() => handleStopAndResetTimer(activeTimer.id)}
            className="px-4 py-2 border border-red-500/70 hover:bg-red-500/20 text-red-400 font-bold text-xs uppercase tracking-widest rounded"
          >
            STOP & RESET
          </button>

          <button
            onClick={() => handleOpenPickerForTimer(activeTimer.id)}
            className="px-4 py-2 border border-[#ffcc00]/60 hover:bg-[#ffcc00]/20 text-[#ffcc00] font-bold text-xs uppercase tracking-widest rounded"
          >
            SET TIME
          </button>
        </div>
      </div>

      {/* Two Columns: Multiple Timers Queue & Multiple Alarms Queue */}
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Multiple Tactical Timers Queue */}
        <div className="border border-[#ffcc00]/40 bg-black/90 p-4 rounded">
          <div className="flex items-center justify-between mb-3 border-b border-[#ffcc00]/30 pb-2">
            <h2 className="text-xs font-black tracking-widest text-[#ffcc00]">TACTICAL TIMERS QUEUE</h2>
            <button
              onClick={() => {
                const newId = `timer-${Date.now()}`;
                const newTimer: TimerItem = {
                  id: newId,
                  label: `OPS TARGET ${timers.length + 1}`,
                  durationSec: 10 * 60,
                  remainingSec: 10 * 60,
                  status: "READY",
                  zeroSound: "theme",
                };
                setTimers((prev) => [...prev, newTimer]);
                setSelectedTimerId(newId);
              }}
              className="text-[10px] px-2 py-0.5 border border-[#ffcc00]/50 hover:bg-[#ffcc00]/20 text-[#ffcc00]"
            >
              + ADD TIMER
            </button>
          </div>

          <div className="space-y-2">
            {timers.map((t) => (
              <div
                key={t.id}
                onClick={() => setSelectedTimerId(t.id)}
                className={`p-2.5 rounded border transition-colors cursor-pointer flex items-center justify-between ${
                  t.id === selectedTimerId
                    ? "border-[#ffcc00] bg-[#ffcc00]/10 shadow-[0_0_10px_rgba(255,204,0,0.15)]"
                    : "border-[#ffcc00]/20 hover:border-[#ffcc00]/40 bg-black/60"
                }`}
              >
                <div>
                  <div className="text-xs font-bold text-[#ffcc00]">{t.label}</div>
                  <div className="text-[10px] text-neutral-400">STATUS: {t.status} • AT ZERO: 24 THEME</div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-base font-black tabular-nums text-[#ffcc00]">{formatHMS(t.remainingSec)}</div>
                  {t.status === "RUNNING" ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePauseTimer(t.id);
                      }}
                      className="text-[10px] px-2 py-1 bg-yellow-600/80 text-black font-bold rounded"
                    >
                      HOLD
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExecuteTimer(t.id);
                      }}
                      className="text-[10px] px-2 py-1 bg-[#ffcc00] text-black font-bold rounded"
                    >
                      RUN
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStopAndResetTimer(t.id);
                    }}
                    className="text-[10px] px-1.5 py-1 border border-red-500/50 text-red-400 hover:bg-red-500/20 rounded"
                    title="Stop & Reset"
                  >
                    STOP
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Multiple Tactical Alarms Queue */}
        <div className="border border-[#ffcc00]/40 bg-black/90 p-4 rounded">
          <div className="flex items-center justify-between mb-3 border-b border-[#ffcc00]/30 pb-2">
            <h2 className="text-xs font-black tracking-widest text-[#ffcc00]">TACTICAL ALARMS QUEUE (BANGKOK)</h2>
            <button
              onClick={() => {
                const newId = `alarm-${Date.now()}`;
                const newAlarm: AlarmItem = {
                  id: newId,
                  label: `FIELD ALARM ${alarms.length + 1}`,
                  timeStr: "08:00",
                  days: [1, 2, 3, 4, 5],
                  armed: true,
                  zeroSound: "theme",
                };
                setAlarms((prev) => [...prev, newAlarm]);
              }}
              className="text-[10px] px-2 py-0.5 border border-[#ffcc00]/50 hover:bg-[#ffcc00]/20 text-[#ffcc00]"
            >
              + ADD ALARM
            </button>
          </div>

          <div className="space-y-2">
            {alarms.map((alarm) => (
              <div
                key={alarm.id}
                className={`p-2.5 rounded border transition-colors flex items-center justify-between ${
                  alarm.armed ? "border-[#ffcc00]/60 bg-[#ffcc00]/5" : "border-neutral-800 bg-black/60 opacity-60"
                }`}
              >
                <div>
                  <div className="text-xs font-bold text-[#ffcc00]">{alarm.label}</div>
                  <div className="text-[10px] text-neutral-400">
                    DAYS: {alarm.days.length === 7 ? "DAILY" : alarm.days.length === 5 && !alarm.days.includes(0) ? "MON-FRI" : `${alarm.days.length} DAYS/WK`} • AT ZERO: 24 THEME
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenPickerForAlarm(alarm.id)}
                    className="text-base font-black tabular-nums text-[#ffcc00] border border-[#ffcc00]/40 px-2 py-0.5 rounded hover:bg-[#ffcc00]/10"
                  >
                    {alarm.timeStr}
                  </button>

                  <button
                    onClick={() => {
                      setAlarms((prev) =>
                        prev.map((a) => (a.id === alarm.id ? { ...a, armed: !a.armed } : a))
                      );
                    }}
                    className={`text-[10px] px-2 py-1 font-bold rounded border ${
                      alarm.armed
                        ? "bg-[#ffcc00] text-black border-[#ffcc00]"
                        : "border-neutral-700 text-neutral-400 hover:text-white"
                    }`}
                  >
                    {alarm.armed ? "ARMED" : "OFF"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Samsung Time Picker Modal */}
      {pickerOpen && pickerTarget && (
        <SamsungTimePicker
          initialHours={
            pickerTarget.type === "timer"
              ? Math.floor(activeTimer.durationSec / 3600)
              : parseInt((alarms.find((a) => a.id === pickerTarget.id)?.timeStr || "06:00").split(":")[0], 10) || 6
          }
          initialMinutes={
            pickerTarget.type === "timer"
              ? Math.floor((activeTimer.durationSec % 3600) / 60)
              : parseInt((alarms.find((a) => a.id === pickerTarget.id)?.timeStr || "06:00").split(":")[1], 10) || 0
          }
          initialSeconds={pickerTarget.type === "timer" ? activeTimer.durationSec % 60 : 0}
          initialDays={pickerTarget.type === "alarm" ? alarms.find((a) => a.id === pickerTarget.id)?.days || [1, 2, 3, 4, 5] : undefined}
          isOpen={pickerOpen}
          mode={pickerTarget.type}
          onConfirm={handlePickerConfirm}
          onCancel={() => {
            setPickerOpen(false);
            setPickerTarget(null);
          }}
        />
      )}

      {/* Full-Screen 24 Countdown Takeover Modal (T-10 to 0) */}
      {takeoverOpen && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-4">
          <div className="text-xs md:text-sm font-black tracking-widest uppercase mb-4 text-[#ffcc00]">
            CTU // TACTICAL COUNTDOWN TAKEOVER
          </div>

          <div
            className={`text-8xl md:text-[14rem] font-black tabular-nums transition-colors duration-200 ${
              takeoverIsCrimson ? "text-red-500 animate-pulse" : "text-[#ffcc00]"
            }`}
          >
            {takeoverDigit}
          </div>

          <div className="text-base md:text-xl font-bold tracking-widest uppercase mt-4 text-[#ffcc00]/80">
            {takeoverLabel}
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
