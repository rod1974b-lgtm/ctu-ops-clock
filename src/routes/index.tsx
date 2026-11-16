// src/routes/index.tsx — CTU 24 Operational Command Terminal
// Features:
// 1. Prominent Local Mission Clock (Bangkok HQ) & Zulu sync with blinking colons
// 2. Multi-timer queue with quick presets, add, run/hold, edit, delete & PiP mini-pill
// 3. Multi-alarm queue (Bangkok Time) with weekly recurring days, armed toggles, add & edit
// 4. Live lockscreen notification drawer streaming & Samsung phone clock sync intents

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { CTUAudio } from "@/lib/ctu-audio";
import { SamsungTimePicker, type SamsungTimePickerValues } from "@/components/samsung-time-picker";
import {
  registerCTUWorker,
  scheduleBackgroundAlert,
  cancelBackgroundAlert,
  updateLockscreenHUD,
  clearLockscreenHUD,
  syncWithNativePhoneClock,
  loadDeadlines,
} from "@/lib/background-alerts";

export const Route = createFileRoute("/")({
  head: () => ({
    title: "CTU 24 Tactical Command Terminal",
    meta: [
      {
        name: "description",
        content: "CTU 24 Tactical Command Terminal featuring Bangkok mission clock, multi-timer queue, recurring alarms, and PiP mini-pill.",
      },
      { property: "og:title", content: "CTU 24 Tactical Command Terminal" },
      { property: "og:description", content: "High-security CTU 24 operations timer with multi-alarm queue and lockscreen HUD." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CTUTacticalTerminal,
});

export interface OperationalTimer {
  id: string;
  label: string;
  durationSec: number;
  remainingSec: number;
  running: boolean;
  timesUp: boolean;
  status: "STANDBY" | "ACTIVE" | "HOLD" | "EXPIRED";
}

export interface TacticalAlarm {
  id: string;
  label: string;
  hour: number;
  minute: number;
  days: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  armed: boolean;
  status: "ARMED" | "STANDBY";
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
  {
    id: "timer-charlie",
    label: "CHARLIE: EXTRACTION",
    durationSec: 15 * 60,
    remainingSec: 15 * 60,
    running: false,
    timesUp: false,
    status: "STANDBY",
  },
];

const INITIAL_ALARMS: TacticalAlarm[] = [
  {
    id: "alarm-briefing",
    label: "MANDATORY BRIEFING",
    hour: 8,
    minute: 0,
    days: [1, 2, 3, 4, 5],
    armed: true,
    status: "ARMED",
  },
  {
    id: "alarm-perimeter",
    label: "PERIMETER CHECK",
    hour: 14,
    minute: 30,
    days: [0, 1, 2, 3, 4, 5, 6],
    armed: true,
    status: "ARMED",
  },
  {
    id: "alarm-debrief",
    label: "SITREP DEBRIEF",
    hour: 20,
    minute: 0,
    days: [1, 2, 3, 4, 5],
    armed: false,
    status: "STANDBY",
  },
];

const QUICK_PRESETS = [
  { label: "TACTICAL SPRINT", seconds: 25 * 60 },
  { label: "INTERROGATION", seconds: 15 * 60 },
  { label: "SATELLITE PASS", seconds: 45 * 60 },
  { label: "FIELD STAND-DOWN", seconds: 5 * 60 },
];

const WORLD_THEATERS = [
  { name: "BANGKOK (HQ)", tz: "Asia/Bangkok" },
  { name: "ZULU / UTC", tz: "UTC" },
  { name: "LOS ANGELES (CTU)", tz: "America/Los_Angeles" },
  { name: "WASHINGTON D.C.", tz: "America/New_York" },
  { name: "LONDON (MI6)", tz: "Europe/London" },
  { name: "TOKYO", tz: "Asia/Tokyo" },
];

function formatDigits(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = String(Math.floor(safe / 3600)).padStart(2, "0");
  const m = String(Math.floor((safe % 3600) / 60)).padStart(2, "0");
  const s = String(safe % 60).padStart(2, "0");
  return { h, m, s };
}

function CTUTacticalTerminal() {
  const [mounted, setMounted] = useState(false);
  const [nowDate, setNowDate] = useState<Date>(() => new Date());
  const [colonVisible, setColonVisible] = useState(true);

  // Timers queue
  const [timers, setTimers] = useState<OperationalTimer[]>(() => {
    if (typeof window === "undefined") return INITIAL_TIMERS;
    try {
      const saved = localStorage.getItem("ctu_timers_v76");
      return saved ? JSON.parse(saved) : INITIAL_TIMERS;
    } catch {
      return INITIAL_TIMERS;
    }
  });

  const [activeTimerId, setActiveTimerId] = useState<string>("timer-alpha");

  // Alarms queue
  const [alarms, setAlarms] = useState<TacticalAlarm[]>(() => {
    if (typeof window === "undefined") return INITIAL_ALARMS;
    try {
      const saved = localStorage.getItem("ctu_alarms_v76");
      return saved ? JSON.parse(saved) : INITIAL_ALARMS;
    } catch {
      return INITIAL_ALARMS;
    }
  });

  // Modal Picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<"timer" | "alarm">("timer");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [pickerInitial, setPickerInitial] = useState<SamsungTimePickerValues>({
    hours: 0,
    minutes: 25,
    seconds: 0,
    days: [0, 1, 2, 3, 4, 5, 6],
  });

  // Controls & Options
  const [zeroSoundChoice] = useState<"loop" | "alarm1" | "alarm2">("loop");
  const [pipActive, setPipActive] = useState(false);
  const [wirePhoneClock, setWirePhoneClock] = useState(false);
  const [osAlertStatus, setOsAlertStatus] = useState<NotificationPermission>("default");

  // Refs
  const timersRef = useRef(timers);
  timersRef.current = timers;
  const activeTimerIdRef = useRef(activeTimerId);
  activeTimerIdRef.current = activeTimerId;
  const timerDeadlinesRef = useRef<Map<string, number>>(new Map());
  const pipCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);

  // Active timer lookup
  const activeTimer = useMemo(() => {
    return timers.find((t) => t.id === activeTimerId) || timers[0] || INITIAL_TIMERS[0];
  }, [timers, activeTimerId]);

  const primaryDigits = useMemo(() => {
    return formatDigits(activeTimer.remainingSec);
  }, [activeTimer.remainingSec]);

  // Unlock Audio
  const unlockAudio = useCallback(() => {
    CTUAudio.unlockAudio();
  }, []);

  // Bangkok & Zulu clock display strings
  const bangkokTime = useMemo(() => {
    const timeFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const dateFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Bangkok",
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
    return {
      time: timeFormatter.format(nowDate),
      date: dateFormatter.format(nowDate).toUpperCase(),
    };
  }, [nowDate]);

  const zuluTime = useMemo(() => {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(nowDate);
  }, [nowDate]);

  // Canvas renderer for Picture-in-Picture floating mini-window
  const drawPipCanvas = useCallback(
    (digits: { h: string; m: string; s: string }, label: string) => {
      const canvas = pipCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.fillStyle = "#09090b";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = "#d97706";
      ctx.lineWidth = 4;
      ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

      ctx.fillStyle = "#f59e0b";
      ctx.font = "bold 13px monospace";
      ctx.fillText(label.slice(0, 24).toUpperCase(), 16, 28);

      ctx.fillStyle = "#fbbf24";
      ctx.font = "bold 60px monospace";
      ctx.fillText(`${digits.h}:${digits.m}:${digits.s}`, 18, 98);

      ctx.fillStyle = "#71717a";
      ctx.font = "bold 12px monospace";
      ctx.fillText("CTU 24 TACTICAL HUD", 16, 136);
    },
    []
  );

  // Request PiP Floating Window
  const handleTogglePip = async () => {
    unlockAudio();
    const video = pipVideoRef.current;
    const canvas = pipCanvasRef.current;
    if (!video || !canvas) return;

    if (document.pictureInPictureElement) {
      try {
        await document.exitPictureInPicture();
        setPipActive(false);
      } catch {}
      return;
    }

    try {
      if (!video.srcObject) {
        drawPipCanvas(primaryDigits, activeTimer.label);
        const stream = canvas.captureStream(10);
        video.srcObject = stream;
        await video.play();
      }
      await video.requestPictureInPicture();
      setPipActive(true);
    } catch (err) {
      console.warn("PiP activation issue:", err);
    }
  };

  // Mount Effect
  useEffect(() => {
    setMounted(true);
    void registerCTUWorker();

    if (typeof window !== "undefined" && "Notification" in window) {
      setOsAlertStatus(Notification.permission);
    }

    const deadlines = loadDeadlines();
    const now = Date.now();
    for (const d of deadlines) {
      if (d.type === "timer" && d.targetEpochMs > now) {
        timerDeadlinesRef.current.set(d.id, d.targetEpochMs);
      }
    }
  }, []);

  // Save timers and alarms to localStorage
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

  // Background scheduling helpers
  const scheduleTimerBackground = useCallback((timer: OperationalTimer, targetEpochMs?: number) => {
    const target = targetEpochMs ?? Date.now() + timer.remainingSec * 1000;
    timerDeadlinesRef.current.set(timer.id, target);
    void scheduleBackgroundAlert({
      id: timer.id,
      label: timer.label,
      targetEpochMs: target,
      type: "timer",
      title: `[CTU CRISIS ALERT] ${timer.label.toUpperCase()} AT ZERO`,
      body: `Operational countdown for "${timer.label}" reached zero!`,
    });
  }, []);

  const cancelTimerBackgroundHelper = useCallback((id: string) => {
    timerDeadlinesRef.current.delete(id);
    void cancelBackgroundAlert(id);
  }, []);

  // Master Clock & Countdown Interval (Every 1 second)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setNowDate(now);
      setColonVisible((c) => !c);

      const currentTimers = timersRef.current;
      const currentActiveId = activeTimerIdRef.current;
      const nowMs = now.getTime();

      let hasStateChanges = false;
      const nextTimers = currentTimers.map((t) => {
        if (!t.running) return t;

        const deadline = timerDeadlinesRef.current.get(t.id);
        const remaining = deadline ? Math.max(0, Math.ceil((deadline - nowMs) / 1000)) : Math.max(0, t.remainingSec - 1);

        if (remaining <= 0) {
          hasStateChanges = true;
          cancelTimerBackgroundHelper(t.id);
          CTUAudio.playZeroAlarm(zeroSoundChoice);
          return {
            ...t,
            remainingSec: 0,
            running: false,
            timesUp: true,
            status: "EXPIRED" as const,
          };
        }

        if (t.id === currentActiveId) {
          if (remaining <= 10) {
            CTUAudio.playCountdownTick(remaining);
          } else {
            CTUAudio.playAmbientTick();
          }
        }

        if (remaining !== t.remainingSec) {
          hasStateChanges = true;
          return { ...t, remainingSec: remaining };
        }
        return t;
      });

      if (hasStateChanges) {
        setTimers(nextTimers);
      }

      // Live HUD streaming to shade & PiP
      const activeRunningTimer = nextTimers.find((t) => t.id === currentActiveId && t.running);
      if (activeRunningTimer) {
        const digits = formatDigits(activeRunningTimer.remainingSec);
        drawPipCanvas(digits, activeRunningTimer.label);
        const deadline = timerDeadlinesRef.current.get(activeRunningTimer.id) ?? nowMs + activeRunningTimer.remainingSec * 1000;
        void updateLockscreenHUD(
          `[CTU ACTIVE] ${activeRunningTimer.label}`,
          `T-MINUS: ${digits.h}:${digits.m}:${digits.s}`,
          activeRunningTimer.id,
          deadline
        );
      } else if (!nextTimers.some((t) => t.running)) {
        void clearLockscreenHUD();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [cancelTimerBackgroundHelper, drawPipCanvas, zeroSoundChoice]);

  // Request Notification Permissions
  const handleRequestOsAlerts = async () => {
    unlockAudio();
    if (typeof window === "undefined" || !("Notification" in window)) {
      alert("Notification alerts not supported in this browser.");
      return;
    }
    const perm = await Notification.requestPermission();
    setOsAlertStatus(perm);
    if (perm === "granted") {
      void registerCTUWorker();
    }
  };

  // Timer Control Handlers
  const handleExecuteTimer = (id: string) => {
    unlockAudio();
    const t = timers.find((x) => x.id === id);
    if (!t) return;

    const startingSec = t.remainingSec > 0 ? t.remainingSec : t.durationSec;
    const deadline = Date.now() + startingSec * 1000;
    scheduleTimerBackground(t, deadline);

    setTimers((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              running: true,
              timesUp: false,
              status: "ACTIVE",
              remainingSec: startingSec,
            }
          : item
      )
    );

    if (wirePhoneClock) {
      syncWithNativePhoneClock("timer", {
        durationSec: startingSec,
        label: t.label,
      });
    }
  };

  const handlePauseTimer = (id: string) => {
    unlockAudio();
    cancelTimerBackgroundHelper(id);
    setTimers((prev) =>
      prev.map((item) => (item.id === id ? { ...item, running: false, status: "HOLD" } : item))
    );
  };

  const handleResetTimer = (id: string) => {
    unlockAudio();
    cancelTimerBackgroundHelper(id);
    setTimers((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              running: false,
              timesUp: false,
              remainingSec: item.durationSec,
              status: "STANDBY",
            }
          : item
      )
    );
  };

  const handleDeleteTimer = (id: string) => {
    unlockAudio();
    cancelTimerBackgroundHelper(id);
    setTimers((prev) => {
      const filtered = prev.filter((t) => t.id !== id);
      if (filtered.length === 0) return INITIAL_TIMERS;
      if (activeTimerId === id) {
        setActiveTimerId(filtered[0]?.id || "timer-alpha");
      }
      return filtered;
    });
  };

  const handleAddTimer = () => {
    unlockAudio();
    const newId = `timer-${Date.now()}`;
    const newTimer: OperationalTimer = {
      id: newId,
      label: `TACTICAL MISSION ${timers.length + 1}`,
      durationSec: 25 * 60,
      remainingSec: 25 * 60,
      running: false,
      timesUp: false,
      status: "STANDBY",
    };
    setTimers((prev) => [...prev, newTimer]);
    setActiveTimerId(newId);
    setEditingItemId(newId);
    setPickerMode("timer");
    setPickerInitial({ hours: 0, minutes: 25, seconds: 0, totalSeconds: 25 * 60 });
    setPickerOpen(true);
  };

  const handleQuickPreset = (seconds: number) => {
    unlockAudio();
    cancelTimerBackgroundHelper(activeTimer.id);
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

  // Alarm Control Handlers
  const handleToggleAlarmArmed = (id: string) => {
    unlockAudio();
    setAlarms((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        const armed = !a.armed;
        if (armed) {
          void scheduleBackgroundAlert({
            id: a.id,
            label: a.label,
            targetEpochMs: Date.now() + 60 * 1000,
            type: "alarm",
            days: a.days,
            title: `[CTU ALARM] ${a.label.toUpperCase()}`,
            body: `Tactical alarm time reached (${String(a.hour).padStart(2, "0")}:${String(a.minute).padStart(2, "0")}).`,
          });
          if (wirePhoneClock) {
            syncWithNativePhoneClock("alarm", {
              hour: a.hour,
              minute: a.minute,
              label: a.label,
            });
          }
        } else {
          void cancelBackgroundAlert(a.id);
        }
        return {
          ...a,
          armed,
          status: armed ? ("ARMED" as const) : ("STANDBY" as const),
        };
      })
    );
  };

  const handleDeleteAlarm = (id: string) => {
    unlockAudio();
    void cancelBackgroundAlert(id);
    setAlarms((prev) => prev.filter((a) => a.id !== id));
  };

  const handleAddAlarm = () => {
    unlockAudio();
    const newId = `alarm-${Date.now()}`;
    const newAlarm: TacticalAlarm = {
      id: newId,
      label: `TACTICAL ALARM ${alarms.length + 1}`,
      hour: 9,
      minute: 0,
      days: [0, 1, 2, 3, 4, 5, 6],
      armed: true,
      status: "ARMED",
    };
    setAlarms((prev) => [...prev, newAlarm]);
    setEditingItemId(newId);
    setPickerMode("alarm");
    setPickerInitial({
      hours: 9,
      minutes: 0,
      seconds: 0,
      days: [0, 1, 2, 3, 4, 5, 6],
    });
    setPickerOpen(true);
  };

  // Time Picker Confirmation
  const handlePickerConfirm = (vals: SamsungTimePickerValues) => {
    unlockAudio();
    if (pickerMode === "timer" && editingItemId) {
      const calculatedSec = vals.totalSeconds ?? vals.hours * 3600 + vals.minutes * 60 + vals.seconds;
      const totalSec = Math.max(1, calculatedSec);
      cancelTimerBackgroundHelper(editingItemId);

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
    } else if (pickerMode === "alarm" && editingItemId) {
      setAlarms((prev) =>
        prev.map((a) =>
          a.id === editingItemId
            ? {
                ...a,
                hour: vals.hours,
                minute: vals.minutes,
                days: vals.days || [0, 1, 2, 3, 4, 5, 6],
              }
            : a
        )
      );
      if (wirePhoneClock) {
        syncWithNativePhoneClock("alarm", {
          hour: vals.hours,
          minute: vals.minutes,
          label: alarms.find((a) => a.id === editingItemId)?.label || "CTU ALARM",
        });
      }
    }
    setPickerOpen(false);
  };

  return (
    <div className="min-h-screen bg-black text-[#ffcc00] font-mono flex flex-col items-center select-none pb-20">
      {/* Hidden elements for Android Picture-in-Picture Mini-Pill */}
      <canvas ref={pipCanvasRef} width={320} height={180} className="hidden" />
      <video ref={pipVideoRef} muted autoPlay playsInline className="hidden" />

      {/* TOP COMMAND HEADER */}
      <header className="w-full max-w-5xl border-b border-[#ffcc00]/40 bg-zinc-950/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 bg-[#ffcc00] animate-pulse rounded-full" />
          <h1 className="text-xl font-black tracking-widest text-[#ffcc00]">CTU // 24 TERMINAL</h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleRequestOsAlerts}
            className={`px-2.5 py-1 text-xs border rounded transition-colors ${
              osAlertStatus === "granted"
                ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                : "border-[#ffcc00]/60 bg-zinc-900 text-[#ffcc00]"
            }`}
          >
            {osAlertStatus === "granted" ? "OS ALERTS: LINKED" : "LINK OS ALERTS"}
          </button>

          <button
            type="button"
            onClick={handleTogglePip}
            className={`px-2.5 py-1 text-xs border rounded transition-colors ${
              pipActive ? "border-[#ffcc00] bg-[#ffcc00]/20 text-[#ffcc00]" : "border-zinc-700 bg-zinc-900 text-zinc-400"
            }`}
          >
            {pipActive ? "FLOATING HUD: ACTIVE" : "POP MINI-HUD (PIP)"}
          </button>

          <button
            type="button"
            onClick={() => setWirePhoneClock((p) => !p)}
            className={`px-2.5 py-1 text-xs border rounded transition-colors ${
              wirePhoneClock ? "border-emerald-500 bg-emerald-500/20 text-emerald-400" : "border-zinc-700 bg-zinc-900 text-zinc-400"
            }`}
          >
            {wirePhoneClock ? "PHONE CLOCK: SYNCED" : "SYNC SAMSUNG CLOCK"}
          </button>
        </div>
      </header>

      {/* WORLD TIME TICKER */}
      <div className="w-full bg-zinc-950 border-b border-[#ffcc00]/30 py-1.5 px-4 overflow-hidden flex gap-8 text-xs text-[#ffcc00]/80">
        {WORLD_THEATERS.map((t) => (
          <div key={t.name} className="flex gap-2 whitespace-nowrap">
            <span className="text-zinc-500">{t.name}:</span>
            <span className="font-bold">
              {new Intl.DateTimeFormat("en-US", {
                timeZone: t.tz,
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
              }).format(nowDate)}
            </span>
          </div>
        ))}
      </div>

      <main className="w-full max-w-5xl px-3 sm:px-4 py-4 flex flex-col gap-4">
        {/* PRIMARY SPLIT CLOCKS HUD */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Mission Clocks Panel (Current Wall Time) */}
          <section className="border-2 border-[#ffcc00] bg-black p-4 shadow-[0_0_20px_rgba(255,204,0,0.2)] flex flex-col justify-between">
            <div className="flex items-center justify-between border-b border-[#ffcc00]/40 pb-2 mb-2">
              <span className="text-xs font-black tracking-widest text-[#ffcc00]">LOCAL MISSION TIME (BANGKOK)</span>
              <span className="text-[11px] text-[#ffcc00]/70 font-mono tracking-wider">UTC+7 // FIELD HQ</span>
            </div>

            <div className="my-4 flex flex-col items-center justify-center">
              <div
                className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-[#ffcc00] drop-shadow-[0_0_15px_rgba(255,204,0,0.6)] tabular-nums"
                suppressHydrationWarning
              >
                {bangkokTime.time.split(":")[0]}
                <span className={colonVisible ? "opacity-100" : "opacity-20"}>:</span>
                {bangkokTime.time.split(":")[1]}
                <span className={colonVisible ? "opacity-100" : "opacity-20"}>:</span>
                {bangkokTime.time.split(":")[2]}
              </div>
              <div className="mt-2 text-xs text-[#ffcc00]/80 tracking-widest font-bold" suppressHydrationWarning>
                {bangkokTime.date}
              </div>
            </div>

            <div className="border-t border-[#ffcc00]/30 pt-2 flex items-center justify-between text-xs">
              <span className="text-[#ffcc00]/70">ZULU SYNC:</span>
              <span className="font-mono font-bold text-[#ffcc00]" suppressHydrationWarning>
                {zuluTime}
              </span>
            </div>
          </section>

          {/* Primary Operational Countdown Panel */}
          <section className="border-2 border-[#ffcc00] bg-black p-4 shadow-[0_0_20px_rgba(255,204,0,0.2)] flex flex-col justify-between">
            <div className="flex items-center justify-between border-b border-[#ffcc00]/40 pb-2 mb-2">
              <span className="text-xs font-black tracking-widest text-[#ffcc00] truncate max-w-[220px]">
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
                [{activeTimer.status}]
              </span>
            </div>

            <div
              onClick={() => {
                unlockAudio();
                setPickerMode("timer");
                setEditingItemId(activeTimer.id);
                const h = Math.floor(activeTimer.durationSec / 3600);
                const m = Math.floor((activeTimer.durationSec % 3600) / 60);
                const s = activeTimer.durationSec % 60;
                setPickerInitial({ hours: h, minutes: m, seconds: s, totalSeconds: activeTimer.durationSec });
                setPickerOpen(true);
              }}
              className="flex flex-col items-center justify-center my-3 py-1 cursor-pointer group"
              title="Tap to adjust operational duration"
            >
              <div className="text-4xl sm:text-5xl md:text-6xl font-black text-[#ffcc00] tracking-tight tabular-nums group-hover:scale-[1.02] transition-transform text-center">
                <span>{primaryDigits.h}</span>
                <span className={colonVisible ? "opacity-100" : "opacity-20"}>:</span>
                <span>{primaryDigits.m}</span>
                <span className={colonVisible ? "opacity-100" : "opacity-20"}>:</span>
                <span>{primaryDigits.s}</span>
              </div>
              <div className="mt-1.5 text-[10px] tracking-widest text-[#ffcc00]/60 group-hover:text-[#ffcc00] transition">
                TAP DIGITS TO MODIFY TIME (SAMSUNG HH:MM:SS)
              </div>
            </div>

            <div className="border-t border-[#ffcc00]/30 pt-3 flex items-center justify-center gap-2 sm:gap-4">
              {!activeTimer.running ? (
                <button
                  type="button"
                  onClick={() => handleExecuteTimer(activeTimer.id)}
                  className="bg-[#ffcc00] text-black font-black text-xs sm:text-sm tracking-widest py-2 px-6 hover:bg-[#ffcc00]/80 active:scale-95 transition shadow-[0_0_15px_rgba(255,204,0,0.4)]"
                >
                  EXECUTE
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handlePauseTimer(activeTimer.id)}
                  className="bg-black border-2 border-[#ffcc00] text-[#ffcc00] font-black text-xs sm:text-sm tracking-widest py-2 px-6 hover:bg-[#ffcc00]/20 active:scale-95 transition"
                >
                  HOLD
                </button>
              )}
              <button
                type="button"
                onClick={() => handleResetTimer(activeTimer.id)}
                className="border border-[#ffcc00]/50 text-[#ffcc00]/80 font-bold text-xs sm:text-sm tracking-widest py-2 px-4 hover:border-[#ffcc00] hover:text-[#ffcc00] active:scale-95 transition"
              >
                RESET
              </button>
            </div>
          </section>
        </div>

        {/* QUICK ARMED PRESETS */}
        <div className="border border-[#ffcc00]/40 bg-black p-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold tracking-wider text-[#ffcc00]/70">QUICK ARMED PRESETS:</span>
          <div className="flex flex-wrap gap-2">
            {QUICK_PRESETS.map((p) => (
              <button
                type="button"
                key={p.label}
                onClick={() => handleQuickPreset(p.seconds)}
                className="border border-[#ffcc00]/50 hover:bg-[#ffcc00] hover:text-black text-[#ffcc00] text-xs font-bold px-3 py-1 tracking-wider transition"
              >
                {p.label} ({Math.floor(p.seconds / 60)}M)
              </button>
            ))}
          </div>
        </div>

        {/* OPERATIONAL QUEUES (MULTIPLE TIMERS & MULTIPLE ALARMS) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Active Timers Queue */}
          <section className="border border-[#ffcc00]/40 bg-black p-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-[#ffcc00]/40 pb-2 mb-2">
                <h2 className="text-xs font-black tracking-widest text-[#ffcc00]">ARMED MISSION TIMERS</h2>
                <button
                  type="button"
                  onClick={handleAddTimer}
                  className="bg-[#ffcc00] text-black px-2 py-0.5 text-[11px] font-black tracking-wider hover:bg-[#ffcc00]/80"
                >
                  + NEW TIMER
                </button>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
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
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          {!t.running ? (
                            <button
                              type="button"
                              onClick={() => handleExecuteTimer(t.id)}
                              className="px-2 py-0.5 bg-[#ffcc00] text-black text-[10px] font-black"
                            >
                              RUN
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handlePauseTimer(t.id)}
                              className="px-2 py-0.5 border border-[#ffcc00] text-[10px] font-bold"
                            >
                              HOLD
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              unlockAudio();
                              setPickerMode("timer");
                              setEditingItemId(t.id);
                              const h = Math.floor(t.durationSec / 3600);
                              const m = Math.floor((t.durationSec % 3600) / 60);
                              const s = t.durationSec % 60;
                              setPickerInitial({ hours: h, minutes: m, seconds: s, totalSeconds: t.durationSec });
                              setPickerOpen(true);
                            }}
                            className="px-2 py-0.5 border border-[#ffcc00]/60 text-[10px] font-bold hover:bg-[#ffcc00] hover:text-black"
                          >
                            EDIT
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTimer(t.id)}
                            className="px-2 py-0.5 border border-red-600/60 text-red-400 text-[10px] font-bold hover:bg-red-600 hover:text-white"
                          >
                            DEL
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Daily Alarms Queue (Bangkok Time) */}
          <section className="border border-[#ffcc00]/40 bg-black p-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-[#ffcc00]/40 pb-2 mb-2">
                <h2 className="text-xs font-black tracking-widest text-[#ffcc00]">
                  TACTICAL ALARMS (BANGKOK TIME)
                </h2>
                <button
                  type="button"
                  onClick={handleAddAlarm}
                  className="bg-[#ffcc00] text-black px-2 py-0.5 text-[11px] font-black tracking-wider hover:bg-[#ffcc00]/80"
                >
                  + NEW ALARM
                </button>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {alarms.length === 0 && <p className="text-[11px] text-[#ffcc00]/60">NO ALARMS CONFIGURED.</p>}
                {alarms.map((a) => {
                  const daysStr =
                    a.days.length === 7
                      ? "DAILY"
                      : a.days.length === 5 && !a.days.includes(0) && !a.days.includes(6)
                      ? "MON-FRI"
                      : a.days.length === 2 && a.days.includes(0) && a.days.includes(6)
                      ? "WEEKENDS"
                      : `${a.days.length} DAYS/WK`;

                  return (
                    <div
                      key={a.id}
                      className={`border p-2 transition ${
                        a.armed ? "border-[#ffcc00]/40 bg-[#ffcc00]/5" : "border-zinc-800 bg-zinc-900/20 text-zinc-500"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-bold tracking-wider truncate ${a.armed ? "text-[#ffcc00]" : "text-zinc-400"}`}>
                          {a.label}
                        </span>
                        <span className="text-sm font-black tabular-nums shrink-0">
                          {String(a.hour).padStart(2, "0")}:{String(a.minute).padStart(2, "0")}
                        </span>
                      </div>

                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[10px] text-[#ffcc00]/70 font-mono tracking-wider">
                          [{daysStr}]
                        </span>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleToggleAlarmArmed(a.id)}
                            className={`px-2 py-0.5 text-[10px] font-black rounded ${
                              a.armed ? "bg-[#ffcc00] text-black" : "border border-zinc-700 text-zinc-400"
                            }`}
                          >
                            {a.armed ? "ARMED" : "STANDBY"}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              unlockAudio();
                              setPickerMode("alarm");
                              setEditingItemId(a.id);
                              setPickerInitial({
                                hours: a.hour,
                                minutes: a.minute,
                                seconds: 0,
                                days: a.days,
                              });
                              setPickerOpen(true);
                            }}
                            className="px-2 py-0.5 border border-[#ffcc00]/60 text-[10px] font-bold text-[#ffcc00] hover:bg-[#ffcc00] hover:text-black rounded"
                          >
                            EDIT
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteAlarm(a.id)}
                            className="px-2 py-0.5 border border-red-600/60 text-red-400 text-[10px] font-bold hover:bg-red-600 hover:text-white rounded"
                          >
                            DEL
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
      </main>

      {/* SAMSUNG TIME DRUM PICKER MODAL */}
      <SamsungTimePicker
        key={`${pickerMode}-${editingItemId || "default"}`}
        isOpen={pickerOpen}
        mode={pickerMode}
        initialHours={pickerInitial.hours}
        initialMinutes={pickerInitial.minutes}
        initialSeconds={pickerInitial.seconds}
        initialDays={pickerInitial.days}
        onConfirm={handlePickerConfirm}
        onCancel={() => setPickerOpen(false)}
      />
    </div>
  );
}
