// src/routes/index.tsx — FULL DROP-IN REPLACEMENT FILE
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
  targetEpochMs?: number;
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
];

const INITIAL_ALARMS: AlarmItem[] = [
  { id: "alarm-1", label: "FIELD SHIFT A", timeStr: "06:00", days: [1, 2, 3, 4, 5], enabled: true, zeroSound: "theme" },
  { id: "alarm-2", label: "ZULU BRIEF", timeStr: "14:00", days: [1, 2, 3, 4, 5], enabled: false, zeroSound: "theme" },
  { id: "alarm-3", label: "COMMS SYNC", timeStr: "22:00", days: [0, 1, 2, 3, 4, 5, 6], enabled: true, zeroSound: "theme" },
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
  const [hStr, mStr] = timeStr.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return null;

  const now = new Date();
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(now.getTime() + offset * 86400000);
    candidate.setHours(h, m, 0, 0);

    if (candidate.getTime() > now.getTime() && days.includes(candidate.getDay())) {
      return candidate.getTime();
    }
  }
  return null;
}

export function CTUTacticalOpsTerminal() {
  const [timers, setTimers] = useState<TimerItem[]>(INITIAL_TIMERS);
  const [alarms, setAlarms] = useState<AlarmItem[]>(INITIAL_ALARMS);
  const [selectedTimerId, setSelectedTimerId] = useState<string>("timer-1");

  // Clocks
  const [bangkokTime, setBangkokTime] = useState<string>("");
  const [zuluTime, setZuluTime] = useState<string>("");

  // Modals & UI Controls
  const [pickerOpen, setPickerOpen] = useState<boolean>(false);
  const [pickerTarget, setPickerTarget] = useState<{ type: "timer" | "alarm"; id: string } | null>(null);

  // Takeover & Ringing
  const [takeoverOpen, setTakeoverOpen] = useState<boolean>(false);
  const [takeoverRemainingSec, setTakeoverRemainingSec] = useState<number>(10);
  const [takeoverSourceLabel, setTakeoverSourceLabel] = useState<string>("");
  const [ringingAlert, setRingingAlert] = useState<{ id: string; label: string; sound: ZeroSoundType } | null>(null);

  // PiP Tactical HUD
  const [pipActive, setPipActive] = useState<boolean>(false);
  const [pipMode, setPipMode] = useState<"TIMERS" | "ALARMS">("TIMERS");
  const pipCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);

  // Wake Lock
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);
  const wakeLockSentinel = useRef<WakeLockSentinel | null>(null);

  // Sync refs for interval updates
  const timersRef = useRef<TimerItem[]>(timers);
  timersRef.current = timers;
  const alarmsRef = useRef<AlarmItem[]>(alarms);
  alarmsRef.current = alarms;

  // Initialize background alerts & worker
  useEffect(() => {
    initBackgroundAlerts();
  }, []);

  // Request screen wake lock
  const requestWakeLock = useCallback(async () => {
    if (typeof window !== "undefined" && "wakeLock" in navigator) {
      try {
        wakeLockSentinel.current = await navigator.wakeLock.request("screen");
        setWakeLockActive(true);
        wakeLockSentinel.current.addEventListener("release", () => {
          setWakeLockActive(false);
          wakeLockSentinel.current = null;
        });
      } catch {
        setWakeLockActive(false);
      }
    }
  }, []);

  useEffect(() => {
    requestWakeLock();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (wakeLockSentinel.current) {
        wakeLockSentinel.current.release().catch(() => {});
      }
    };
  }, [requestWakeLock]);

  // World Clocks Tick
  useEffect(() => {
    const updateClocks = () => {
      const now = new Date();
      setBangkokTime(
        now.toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour12: false })
      );
      setZuluTime(
        now.toLocaleTimeString("en-GB", { timeZone: "UTC", hour12: false })
      );
    };
    updateClocks();
    const interval = setInterval(updateClocks, 1000);
    return () => clearInterval(interval);
  }, []);

  // Tactical Offscreen Canvas PiP HUD Renderer
  const renderPipFrame = useCallback(
    (mode: "TIMERS" | "ALARMS") => {
      const canvas = pipCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;

      // Clear dark obsidian background
      ctx.fillStyle = "#030712";
      ctx.fillRect(0, 0, width, height);

      // CTU Amber / Crimson Header
      const isEmergency = takeoverOpen || !!ringingAlert;
      ctx.strokeStyle = isEmergency ? "#ef4444" : "#ffcc00";
      ctx.lineWidth = 3;
      ctx.strokeRect(4, 4, width - 8, height - 8);

      ctx.fillStyle = isEmergency ? "#ef4444" : "#ffcc00";
      ctx.font = "bold 13px 'Courier New', monospace";
      ctx.fillText(
        `CTU MINI-HUD // [${mode}] // BANGKOK: ${bangkokTime || "--:--:--"}`,
        12,
        22
      );

      ctx.strokeStyle = "#374151";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(10, 30);
      ctx.lineTo(width - 10, 30);
      ctx.stroke();

      let currentY = 50;

      if (mode === "TIMERS") {
        const activeTimers = timersRef.current;
        activeTimers.slice(0, 6).forEach((t) => {
          const isTargetEmergency = t.status === "RUNNING" && t.remainingSec <= 10 && t.remainingSec > 0;
          ctx.fillStyle = isTargetEmergency ? "#ef4444" : t.status === "RUNNING" ? "#ffcc00" : "#9ca3af";
          ctx.font = "bold 11px 'Courier New', monospace";
          ctx.fillText(`[${t.status.padEnd(7)}] ${t.label.slice(0, 15)}`, 14, currentY);

          ctx.font = "bold 13px 'Courier New', monospace";
          ctx.fillText(formatHMS(t.remainingSec), width - 90, currentY);
          currentY += 28;
        });
      } else {
        const armedAlarms = alarmsRef.current;
        armedAlarms.slice(0, 6).forEach((a) => {
          const nextMs = a.enabled ? getNextAlarmEpochMs(a.timeStr, a.days) : null;
          const deltaSec = nextMs ? Math.max(0, Math.floor((nextMs - Date.now()) / 1000)) : null;

          ctx.fillStyle = a.enabled ? "#ffcc00" : "#6b7280";
          ctx.font = "bold 11px 'Courier New', monospace";
          ctx.fillText(`[${a.enabled ? "ARMED" : "OFF"}] ${a.label.slice(0, 15)} @ ${a.timeStr}`, 14, currentY);

          ctx.font = "bold 12px 'Courier New', monospace";
          ctx.fillText(deltaSec !== null ? `T-${formatHMS(deltaSec)}` : "--:--:--", width - 105, currentY);
          currentY += 28;
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

  // Open PiP with specific mode
  const openPipHud = async (targetMode: "TIMERS" | "ALARMS") => {
    setPipMode(targetMode);
    CTUAudio.unlockAudio();

    if (pipActive && document.pictureInPictureElement) {
      renderPipFrame(targetMode);
      return;
    }

    try {
      if (!pipCanvasRef.current) {
        const canvas = document.createElement("canvas");
        canvas.width = 440;
        canvas.height = 240;
        pipCanvasRef.current = canvas;
      }

      if (!pipVideoRef.current) {
        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        pipVideoRef.current = video;
      }

      renderPipFrame(targetMode);
      const stream = pipCanvasRef.current.captureStream(10);
      pipVideoRef.current.srcObject = stream;
      await pipVideoRef.current.play();
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
      console.warn("[CTU] Failed to start Picture-in-Picture HUD:", err);
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

          // Enter T-10 Takeover if within 10 seconds and not already in takeover
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
            // Trigger zero sound
            CTUAudio.stopCountdownAudio();
            setTakeoverOpen(false);
            setRingingAlert({ id: t.id, label: t.label, sound: t.zeroSound });
            CTUAudio.triggerZeroSound(t.zeroSound);
            clearLockscreenHUD();

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

  // Timer Actions
  const handleExecuteTimer = (id: string) => {
    CTUAudio.unlockAudio();
    CTUAudio.playChirp();

    setTimers((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const targetMs = Date.now() + t.remainingSec * 1000;

        scheduleLocalAlert({
          id: t.id,
          label: t.label,
          targetEpochMs: targetMs,
          type: "timer",
        });

        updateLockscreenHUD(
          `CTU TIMER: ${t.label}`,
          `Target: ${formatHMS(t.remainingSec)} remaining`,
          t.id,
          targetMs
        );

        return {
          ...t,
          status: "RUNNING",
          targetEpochMs: targetMs,
        };
      })
    );
  };

  const handlePauseTimer = (id: string) => {
    CTUAudio.playTick();
    setTimers((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        cancelLocalAlert(t.id);
        clearLockscreenHUD();
        return {
          ...t,
          status: "PAUSED",
          targetEpochMs: undefined,
        };
      })
    );
  };

  const handleStopAndResetTimer = (id: string) => {
    CTUAudio.stopCountdownAudio();
    CTUAudio.stopAllAudio();
    cancelLocalAlert(id);
    clearLockscreenHUD();

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
    setSelectedTimerId(id);
    setPickerTarget({ type: "timer", id });
    setPickerOpen(true);
  };

  const handleOpenPickerForAlarm = (id: string) => {
    setPickerTarget({ type: "alarm", id });
    setPickerOpen(true);
  };

  const handlePickerConfirm = (result: SamsungTimePickerValues) => {
    if (!pickerTarget) return;

    if (pickerTarget.type === "timer") {
      let resolvedSec = 0;
      if (typeof result.totalSeconds === "number" && !isNaN(result.totalSeconds) && result.totalSeconds > 0) {
        resolvedSec = result.totalSeconds;
      } else if (typeof result.totalSec === "number" && !isNaN(result.totalSec) && result.totalSec > 0) {
        resolvedSec = result.totalSec;
      } else {
        const h = result.hours || 0;
        const m = result.minutes || 0;
        const s = result.seconds || 0;
        resolvedSec = h * 3600 + m * 60 + s;
      }

      if (resolvedSec <= 0) resolvedSec = 60; // minimum fallback

      setTimers((prev) =>
        prev.map((t) =>
          t.id === pickerTarget.id
            ? { ...t, durationSec: resolvedSec, remainingSec: resolvedSec, status: "IDLE", targetEpochMs: undefined }
            : t
        )
      );
    } else {
      const timeStr = result.timeStr || `${String(result.hours || 6).padStart(2, "0")}:${String(result.minutes || 0).padStart(2, "0")}`;
      const days = result.days && result.days.length > 0 ? result.days : [1, 2, 3, 4, 5];

      setAlarms((prev) =>
        prev.map((a) =>
          a.id === pickerTarget.id
            ? { ...a, timeStr, days }
            : a
        )
      );
    }

    setPickerOpen(false);
    setPickerTarget(null);
  };

  const handleToggleAlarm = (id: string) => {
    CTUAudio.unlockAudio();
    CTUAudio.playTick();

    setAlarms((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        const nextEnabled = !a.enabled;

        if (nextEnabled) {
          const nextEpoch = getNextAlarmEpochMs(a.timeStr, a.days);
          if (nextEpoch) {
            scheduleLocalAlert({
              id: a.id,
              label: a.label,
              targetEpochMs: nextEpoch,
              type: "alarm",
              days: a.days,
            });
          }
        } else {
          cancelLocalAlert(a.id);
        }

        return { ...a, enabled: nextEnabled };
      })
    );
  };

  const silenceRingingAlert = () => {
    CTUAudio.stopAllAudio();
    CTUAudio.stopCountdownAudio();
    setRingingAlert(null);
  };

  const activeTimer = timers.find((t) => t.id === selectedTimerId) || timers[0] || INITIAL_TIMERS[0];

  return (
    <div className="min-h-screen bg-[#030712] text-[#ffcc00] font-mono flex flex-col p-2 sm:p-4 selection:bg-[#ffcc00] selection:text-black">
      {/* Top Tactical Command Header */}
      <header className="border border-[#ffcc00]/40 bg-[#090d16] p-3 rounded mb-3 flex flex-wrap items-center justify-between gap-2 shadow-[0_0_15px_rgba(255,204,0,0.15)]">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-[#ffcc00] animate-pulse rounded-full" />
          <h1 className="text-sm sm:text-base font-black tracking-widest text-[#ffcc00] uppercase">
            CTU // LOS ANGELES SUB-STATION // OPS CLOCK
          </h1>
        </div>

        {/* Tactical PiP & Wake Lock Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => openPipHud("TIMERS")}
            className={`px-2.5 py-1 text-xs font-bold border transition-colors rounded ${
              pipActive && pipMode === "TIMERS"
                ? "bg-[#ffcc00] text-black border-[#ffcc00]"
                : "border-[#ffcc00]/60 text-[#ffcc00] hover:bg-[#ffcc00]/20"
            }`}
          >
            [PIP TIMERS]
          </button>

          <button
            onClick={() => openPipHud("ALARMS")}
            className={`px-2.5 py-1 text-xs font-bold border transition-colors rounded ${
              pipActive && pipMode === "ALARMS"
                ? "bg-[#ffcc00] text-black border-[#ffcc00]"
                : "border-[#ffcc00]/60 text-[#ffcc00] hover:bg-[#ffcc00]/20"
            }`}
          >
            [PIP ALARMS]
          </button>

          <button
            onClick={requestWakeLock}
            className={`px-2 py-1 text-xs border rounded transition-colors ${
              wakeLockActive
                ? "border-emerald-500 text-emerald-400 bg-emerald-950/30"
                : "border-gray-600 text-gray-400"
            }`}
          >
            WAKE: {wakeLockActive ? "ENGAGED" : "OFF"}
          </button>
        </div>
      </header>

      {/* World Theaters Synchronized Clocks */}
      <section className="grid grid-cols-2 gap-2 sm:gap-4 mb-4">
        <div className="border border-[#ffcc00]/30 bg-[#090d16]/90 p-3 rounded text-center">
          <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
            LOCAL THEATER // BANGKOK (ICT +7)
          </div>
          <div className="text-2xl sm:text-4xl font-black text-[#ffcc00] tracking-wider mt-1">
            {bangkokTime || "--:--:--"}
          </div>
        </div>

        <div className="border border-[#ffcc00]/30 bg-[#090d16]/90 p-3 rounded text-center">
          <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
            OPERATIONAL // ZULU / UTC
          </div>
          <div className="text-2xl sm:text-4xl font-black text-[#ffcc00] tracking-wider mt-1">
            {zuluTime || "--:--:--"}
          </div>
        </div>
      </section>

      {/* Primary Focus Timer Showcase */}
      <section className="border-2 border-[#ffcc00] bg-[#090d16] p-4 rounded mb-4 shadow-[0_0_20px_rgba(255,204,0,0.2)]">
        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest border-b border-[#ffcc00]/30 pb-2 mb-3">
          <span className="text-[#ffcc00]">
            PRIMARY FOCUS: {activeTimer.label} [{activeTimer.status}]
          </span>
          <span className="text-gray-400">DURATION: {formatHMS(activeTimer.durationSec)}</span>
        </div>

        <div className="text-center py-4">
          <div className="text-5xl sm:text-7xl font-black tracking-widest text-[#ffcc00]">
            {formatHMS(activeTimer.remainingSec)}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          {activeTimer.status !== "RUNNING" ? (
            <button
              onClick={() => handleExecuteTimer(activeTimer.id)}
              className="px-6 py-2 bg-[#ffcc00] text-black font-black uppercase text-xs sm:text-sm tracking-widest rounded hover:bg-[#ffd633]"
            >
              EXECUTE TIMER
            </button>
          ) : (
            <button
              onClick={() => handlePauseTimer(activeTimer.id)}
              className="px-6 py-2 bg-amber-600 text-black font-black uppercase text-xs sm:text-sm tracking-widest rounded hover:bg-amber-500"
            >
              HOLD / PAUSE
            </button>
          )}

          <button
            onClick={() => handleStopAndResetTimer(activeTimer.id)}
            className="px-4 py-2 border border-red-500/70 text-red-400 font-bold uppercase text-xs tracking-widest rounded hover:bg-red-500/20"
          >
            STOP / RESET
          </button>

          <button
            onClick={() => handleOpenPickerForTimer(activeTimer.id)}
            className="px-4 py-2 border border-[#ffcc00]/60 text-[#ffcc00] font-bold uppercase text-xs tracking-widest rounded hover:bg-[#ffcc00]/20"
          >
            EDIT DURATION
          </button>

          <button
            onClick={() =>
              syncWithNativePhoneClock("timer", {
                durationSec: activeTimer.durationSec,
                label: activeTimer.label,
              })
            }
            className="px-3 py-2 border border-blue-500/50 text-blue-400 font-bold uppercase text-xs tracking-widest rounded hover:bg-blue-500/20"
          >
            SAMSUNG PHONE SYNC
          </button>
        </div>
      </section>

      {/* Split Surveillance Tactical Grid: Active Timers & Alarms Queues */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
        {/* Multi-Timer Operational Queue */}
        <div className="border border-[#ffcc00]/40 bg-[#090d16] p-3 rounded">
          <div className="text-xs font-bold uppercase tracking-widest text-[#ffcc00] border-b border-[#ffcc00]/30 pb-2 mb-2 flex items-center justify-between">
            <span>TACTICAL TIMERS QUEUE ({timers.length})</span>
            <span className="text-[10px] text-gray-400">TAP TO SELECT</span>
          </div>

          <div className="space-y-2">
            {timers.map((t) => {
              const isSelected = t.id === selectedTimerId;
              return (
                <div
                  key={t.id}
                  onClick={() => setSelectedTimerId(t.id)}
                  className={`p-2.5 rounded border transition-all cursor-pointer flex items-center justify-between ${
                    isSelected
                      ? "border-[#ffcc00] bg-[#ffcc00]/10"
                      : "border-gray-800 bg-gray-950/50 hover:border-gray-700"
                  }`}
                >
                  <div>
                    <div className="text-xs font-bold text-gray-200">{t.label}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      SET: {formatHMS(t.durationSec)} // SOUND: {t.zeroSound.toUpperCase()}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-black ${
                        t.status === "RUNNING"
                          ? "text-[#ffcc00]"
                          : t.status === "EXPIRED"
                          ? "text-red-500"
                          : "text-gray-400"
                      }`}
                    >
                      {formatHMS(t.remainingSec)}
                    </span>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenPickerForTimer(t.id);
                      }}
                      className="text-[10px] border border-gray-700 px-1.5 py-0.5 rounded text-gray-400 hover:text-[#ffcc00]"
                    >
                      EDIT
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Multi-Alarm Operational Queue */}
        <div className="border border-[#ffcc00]/40 bg-[#090d16] p-3 rounded">
          <div className="text-xs font-bold uppercase tracking-widest text-[#ffcc00] border-b border-[#ffcc00]/30 pb-2 mb-2 flex items-center justify-between">
            <span>SCHEDULED ALARMS QUEUE ({alarms.length})</span>
            <span className="text-[10px] text-gray-400">BANGKOK TIME</span>
          </div>

          <div className="space-y-2">
            {alarms.map((a) => {
              const nextEpoch = a.enabled ? getNextAlarmEpochMs(a.timeStr, a.days) : null;
              const deltaSec = nextEpoch ? Math.max(0, Math.floor((nextEpoch - Date.now()) / 1000)) : null;

              return (
                <div
                  key={a.id}
                  className={`p-2.5 rounded border transition-all flex items-center justify-between ${
                    a.enabled
                      ? "border-[#ffcc00]/50 bg-[#ffcc00]/5"
                      : "border-gray-800 bg-gray-950/40 opacity-70"
                  }`}
                >
                  <div>
                    <div className="text-xs font-bold text-gray-200">{a.label}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      DAYS: {a.days.map((d) => ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][d]).join(", ")}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <div className="text-sm font-black text-[#ffcc00]">{a.timeStr}</div>
                      <div className="text-[9px] text-gray-400">
                        {deltaSec !== null ? `IN ${formatHMS(deltaSec)}` : "STANDBY"}
                      </div>
                    </div>

                    <button
                      onClick={() => handleToggleAlarm(a.id)}
                      className={`text-[10px] font-bold px-2 py-1 rounded border transition-colors ${
                        a.enabled
                          ? "bg-[#ffcc00] text-black border-[#ffcc00]"
                          : "border-gray-700 text-gray-400 hover:text-white"
                      }`}
                    >
                      {a.enabled ? "ARMED" : "OFF"}
                    </button>

                    <button
                      onClick={() => handleOpenPickerForAlarm(a.id)}
                      className="text-[10px] border border-gray-700 px-1.5 py-1 rounded text-gray-400 hover:text-[#ffcc00]"
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

      {/* Ringing / Triggered Alarm Banner */}
      {ringingAlert && (
        <div className="fixed bottom-4 left-4 right-4 z-50 bg-red-950 border-2 border-red-500 text-red-200 p-4 rounded shadow-2xl flex flex-wrap items-center justify-between gap-3 animate-pulse">
          <div>
            <div className="text-xs font-black tracking-widest uppercase text-red-400">
              TARGET TRIGGER REACHED ZERO // 24 AT ZERO SOUND ACTIVATED
            </div>
            <div className="text-lg font-bold text-white">{ringingAlert.label}</div>
          </div>
          <button
            onClick={silenceRingingAlert}
            className="px-6 py-3 bg-red-600 text-white font-black text-sm uppercase tracking-widest rounded hover:bg-red-500"
          >
            SILENCE / STOP ALARM
          </button>
        </div>
      )}

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
            className={`text-8xl md:text-9xl font-black font-mono tracking-widest transition-colors ${
              takeoverRemainingSec <= 3 ? "text-red-500 animate-ping" : "text-[#ffcc00]"
            }`}
          >
            {takeoverRemainingSec.toString().padStart(2, "0")}
          </div>

          <div className="text-sm font-bold uppercase tracking-widest text-gray-400 mt-6 text-center">
            TARGET: {takeoverSourceLabel}
          </div>

          <button
            onClick={() => {
              CTUAudio.stopCountdownAudio();
              setTakeoverOpen(false);
            }}
            className="mt-8 px-6 py-2 border border-red-500 text-red-400 hover:bg-red-500/20 text-xs font-bold uppercase tracking-widest rounded"
          >
            ABORT COUNTDOWN
          </button>
        </div>
      )}
    </div>
  );
}
