// src/routes/index.tsx — CTU 24 Operational Terminal with PiP Floating Mini-HUD & Phone Integration
import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { CTUAudio } from "@/lib/ctu-audio";
import { SamsungTimePicker } from "@/components/samsung-time-picker";
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
        content: "CTU 24 Tactical Command Terminal featuring digital mission countdowns, recurring alarms, PiP mini-pill, and notification HUD.",
      },
      { property: "og:title", content: "CTU 24 Tactical Command Terminal" },
      { property: "og:description", content: "High-security CTU 24 operations timer with lock-screen HUD." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CTUTacticalTerminal,
});

interface OperationalTimer {
  id: string;
  label: string;
  durationSec: number;
  remainingSec: number;
  running: boolean;
  timesUp: boolean;
  status: "ACTIVE" | "HOLD" | "STANDBY" | "EXPIRED";
}

interface TacticalAlarm {
  id: string;
  label: string;
  hour: number;
  minute: number;
  days: number[];
  armed: boolean;
  status: "ARMED" | "STANDBY";
}

const INITIAL_TIMERS: OperationalTimer[] = [
  {
    id: "timer-alpha",
    label: "TACTICAL SPRINT",
    durationSec: 25 * 60,
    remainingSec: 25 * 60,
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
];

const WORLD_THEATERS = [
  { name: "BANGKOK (HQ)", tz: "Asia/Bangkok" },
  { name: "ZULU / UTC", tz: "UTC" },
  { name: "LOS ANGELES (CTU)", tz: "America/Los_Angeles" },
  { name: "WASHINGTON D.C.", tz: "America/New_York" },
  { name: "LONDON (MI6)", tz: "Europe/London" },
  { name: "TOKYO", tz: "Asia/Tokyo" },
];

function CTUTacticalTerminal() {
  const [mounted, setMounted] = useState(false);
  const [nowDate, setNowDate] = useState<Date>(() => new Date());
  const [colonVisible, setColonVisible] = useState(true);

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
  const [alarms, setAlarms] = useState<TacticalAlarm[]>(() => {
    if (typeof window === "undefined") return INITIAL_ALARMS;
    try {
      const saved = localStorage.getItem("ctu_alarms_v76");
      return saved ? JSON.parse(saved) : INITIAL_ALARMS;
    } catch {
      return INITIAL_ALARMS;
    }
  });

  const [wirePhoneClock, setWirePhoneClock] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [osAlertStatus, setOsAlertStatus] = useState<NotificationPermission>("default");

  const [crisisOverlay, setCrisisOverlay] = useState(false);
  const [countdownTakeover, setCountdownTakeover] = useState(false);
  const [countdownRemaining, setCountdownRemaining] = useState(10);
  const [countdownLabel, setCountdownLabel] = useState("");
  const [zeroSoundChoice, setZeroSoundChoice] = useState<"crisis" | "countdown">("crisis");

  // Samsung Picker State
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<"timer" | "alarm">("timer");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [pickerInitial, setPickerInitial] = useState<{
    hours: number;
    minutes: number;
    seconds: number;
    totalSeconds?: number;
    days?: number[];
  }>({ hours: 0, minutes: 25, seconds: 0, totalSeconds: 1500 });

  // Canvas and hidden video element for Android Picture-in-Picture
  const pipCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);

  const timersRef = useRef(timers);
  timersRef.current = timers;
  const alarmsRef = useRef(alarms);
  alarmsRef.current = alarms;
  const activeTimerIdRef = useRef(activeTimerId);
  activeTimerIdRef.current = activeTimerId;
  const timerDeadlinesRef = useRef<Map<string, number>>(new Map());
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const unlockAudio = useCallback(() => {
    CTUAudio.unlockAudio();
  }, []);

  const activeTimer = useMemo(() => {
    return timers.find((t) => t.id === activeTimerId) || timers[0] || INITIAL_TIMERS[0];
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

  // Background Scheduling
  const scheduleTimerBackground = useCallback((timer: OperationalTimer, targetEpoch?: number) => {
    const epoch = targetEpoch || Date.now() + timer.remainingSec * 1000;
    void scheduleBackgroundAlert({
      id: timer.id,
      label: timer.label,
      type: "timer",
      targetEpochMs: epoch,
      title: `[CTU CRISIS ALERT] ${timer.label.toUpperCase()}`,
      body: `Operational countdown reached zero!`,
    });
  }, []);

  const cancelTimerBackground = useCallback((id: string) => {
    void cancelBackgroundAlert(id);
  }, []);

  // Picture-in-Picture Rendering Routine
  const drawPipCanvas = useCallback((digits: { h: string; m: string; s: string }, label: string) => {
    const canvas = pipCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#030712";
    ctx.fillRect(0, 0, 320, 180);

    // Amber border
    ctx.strokeStyle = "#ffaa00";
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 316, 176);

    // Label
    ctx.fillStyle = "#f59e0b";
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`CTU 24 // ${label.toUpperCase().slice(0, 18)}`, 160, 32);

    // LED Digits
    ctx.fillStyle = "#ffaa00";
    ctx.shadowColor = "#ffaa00";
    ctx.shadowBlur = 10;
    ctx.font = "bold 52px monospace";
    ctx.fillText(`${digits.h}:${digits.m}:${digits.s}`, 160, 108);

    // Status Footer
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#10b981";
    ctx.font = "bold 12px monospace";
    ctx.fillText("TACTICAL ACTIVE • TAP TO RETURN", 160, 148);
  }, []);

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

  // Screen Wake Lock
  useEffect(() => {
    const isAnyRunning = timers.some((t) => t.running);
    if (!isAnyRunning) {
      if (wakeLockRef.current) {
        void wakeLockRef.current.release();
        wakeLockRef.current = null;
        setWakeLockActive(false);
      }
      return;
    }

    const acquireLock = async () => {
      try {
        if ("wakeLock" in navigator && !wakeLockRef.current) {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
          setWakeLockActive(true);
          wakeLockRef.current.addEventListener("release", () => {
            wakeLockRef.current = null;
            setWakeLockActive(false);
          });
        }
      } catch {}
    };

    void acquireLock();
  }, [timers]);

  // Master Heartbeat: 1-second Tick
  useEffect(() => {
    const tick = setInterval(() => {
      const now = new Date();
      setNowDate(now);
      setColonVisible((p) => !p);

      const expiredTimers: OperationalTimer[] = [];
      let currentActiveTimer: OperationalTimer | null = null;

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

          if (timer.id === activeTimerIdRef.current) {
            currentActiveTimer = { ...timer, remainingSec: currentRemaining };
          }

          return { ...timer, remainingSec: currentRemaining };
        });

        return changed ? next : prev;
      });

      // Update PiP Canvas & Notification Shade HUD
      if (currentActiveTimer) {
        const digits = formatDigits(currentActiveTimer.remainingSec);
        drawPipCanvas(digits, currentActiveTimer.label);

        void updateLockscreenHUD(
          `[CTU] ${digits.h}:${digits.m}:${digits.s} — ${currentActiveTimer.label}`,
          `Operation running. Tap to open command terminal.`,
          currentActiveTimer.id,
          Date.now() + currentActiveTimer.remainingSec * 1000
        );
      } else if (!timersRef.current.some((t) => t.running)) {
        void clearLockscreenHUD();
      }

      // Handle Expired Timers
      for (const expired of expiredTimers) {
        cancelTimerBackground(expired.id);
        timerDeadlinesRef.current.delete(expired.id);
        void clearLockscreenHUD();
        setCrisisOverlay(true);
        setCountdownLabel(expired.label);
        CTUAudio.triggerZeroSound(zeroSoundChoice);
      }
    }, 1000);

    return () => clearInterval(tick);
  }, [cancelTimerBackground, drawPipCanvas, zeroSoundChoice]);

  // Execute Timer Action
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

    // If phone clock wiring is enabled, dispatch Android system timer intent
    if (wirePhoneClock) {
      syncWithNativePhoneClock("timer", {
        durationSec: startingSec,
        label: timer.label,
      });
    }
  };

  const handlePauseTimer = (id: string) => {
    unlockAudio();
    cancelTimerBackground(id);
    timerDeadlinesRef.current.delete(id);
    void clearLockscreenHUD();
    setTimers((prev) => prev.map((t) => (t.id === id ? { ...t, running: false, status: "HOLD" } : t)));
  };

  const handleResetTimer = (id: string) => {
    unlockAudio();
    cancelTimerBackground(id);
    timerDeadlinesRef.current.delete(id);
    void clearLockscreenHUD();
    CTUAudio.stopCountdownSound();
    setTimers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, running: false, timesUp: false, status: "STANDBY", remainingSec: t.durationSec } : t))
    );
  };

  const handlePickerConfirm = (values: {
    hours: number;
    minutes: number;
    seconds: number;
    totalSeconds: number;
    days?: number[];
  }) => {
    if (pickerMode === "timer" && editingItemId) {
      const safeDuration = Math.max(1, values.totalSeconds);
      setTimers((prev) =>
        prev.map((t) =>
          t.id === editingItemId
            ? { ...t, durationSec: safeDuration, remainingSec: safeDuration, running: false, timesUp: false, status: "STANDBY" }
            : t
        )
      );
    } else if (pickerMode === "alarm" && editingItemId) {
      const days = values.days && values.days.length > 0 ? values.days : [0, 1, 2, 3, 4, 5, 6];
      setAlarms((prev) =>
        prev.map((a) => (a.id === editingItemId ? { ...a, hour: values.hours, minute: values.minutes, days, armed: true } : a))
      );

      if (wirePhoneClock) {
        syncWithNativePhoneClock("alarm", {
          hour: values.hours,
          minute: values.minutes,
          label: "CTU BRIEFING",
        });
      }
    }
    setPickerOpen(false);
  };

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

  return (
    <div className="min-h-screen bg-black text-amber-500 font-mono flex flex-col items-center select-none pb-20">
      {/* Hidden elements for Android Picture-in-Picture Mini-Pill */}
      <canvas ref={pipCanvasRef} width={320} height={180} className="hidden" />
      <video ref={pipVideoRef} muted autoPlay playsInline className="hidden" />

      {/* TOP COMMAND HEADER */}
      <header className="w-full max-w-4xl border-b border-amber-900/60 bg-zinc-950/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 bg-amber-500 animate-pulse rounded-full" />
          <h1 className="text-xl font-black tracking-widest text-amber-400">CTU // 24 TERMINAL</h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleTogglePip}
            className={`px-2.5 py-1 text-xs border rounded transition-colors ${
              pipActive ? "border-amber-400 bg-amber-500/20 text-amber-300" : "border-zinc-700 bg-zinc-900 text-zinc-400"
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
      <div className="w-full bg-zinc-950 border-b border-amber-950 py-1.5 px-4 overflow-hidden flex gap-8 text-xs text-amber-400/80">
        {WORLD_THEATERS.map((t) => (
          <div key={t.name} className="flex gap-2 whitespace-nowrap">
            <span className="text-zinc-500">{t.name}:</span>
            <span className="font-bold">
              {new Intl.DateTimeFormat("en-US", { timeZone: t.tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(nowDate)}
            </span>
          </div>
        ))}
      </div>

      {/* MAIN 7-SEGMENT COUNTDOWN DISPLAY */}
      <main className="w-full max-w-4xl px-4 py-6 flex flex-col items-center gap-6">
        <div className="text-center">
          <div className="text-xs text-amber-500/70 tracking-widest">TACTICAL MISSION TARGET</div>
          <div className="text-lg font-bold text-amber-400">{activeTimer.label}</div>
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
          className="cursor-pointer bg-zinc-950 border-2 border-amber-500/50 rounded-lg p-6 shadow-[0_0_30px_rgba(245,158,11,0.2)] flex items-center justify-center gap-2 hover:border-amber-400 transition-colors"
          title="Tap to adjust operational duration"
        >
          <div className="flex items-center text-6xl md:text-8xl font-black font-mono tracking-wider text-amber-400">
            <span>{primaryDigits.h}</span>
            <span className={colonVisible ? "opacity-100" : "opacity-20"}>:</span>
            <span>{primaryDigits.m}</span>
            <span className={colonVisible ? "opacity-100" : "opacity-20"}>:</span>
            <span>{primaryDigits.s}</span>
          </div>
        </div>

        {/* PRIMARY CONTROLS */}
        <div className="flex gap-4">
          {!activeTimer.running ? (
            <button
              type="button"
              onClick={() => handleExecuteTimer(activeTimer.id)}
              className="px-8 py-3 bg-amber-500 hover:bg-amber-400 text-black font-black tracking-widest text-lg rounded shadow-lg transition-transform active:scale-95"
            >
              EXECUTE
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handlePauseTimer(activeTimer.id)}
              className="px-8 py-3 bg-red-600 hover:bg-red-500 text-white font-black tracking-widest text-lg rounded shadow-lg transition-transform active:scale-95"
            >
              HOLD
            </button>
          )}

          <button
            type="button"
            onClick={() => handleResetTimer(activeTimer.id)}
            className="px-6 py-3 border border-zinc-700 hover:border-amber-500/50 text-zinc-300 font-bold tracking-widest text-sm rounded transition-colors"
          >
            RESET
          </button>
        </div>

        {/* TACTICAL ALARMS SECTION */}
        <section className="w-full mt-8 border border-zinc-900 bg-zinc-950/60 rounded p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-bold tracking-wider text-amber-400">
              TACTICAL ALARMS (BANGKOK TIME: {bangkokTime.time})
            </h2>
          </div>

          <div className="flex flex-col gap-2">
            {alarms.map((alarm) => (
              <div
                key={alarm.id}
                className="flex items-center justify-between p-3 border border-zinc-800 bg-zinc-900/40 rounded"
              >
                <div>
                  <div className="text-amber-300 font-bold text-lg">
                    {String(alarm.hour).padStart(2, "0")}:{String(alarm.minute).padStart(2, "0")}
                  </div>
                  <div className="text-xs text-zinc-500">{alarm.label}</div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      unlockAudio();
                      setPickerMode("alarm");
                      setEditingItemId(alarm.id);
                      setPickerInitial({
                        hours: alarm.hour,
                        minutes: alarm.minute,
                        seconds: 0,
                        days: alarm.days,
                      });
                      setPickerOpen(true);
                    }}
                    className="px-3 py-1 text-xs border border-zinc-700 hover:border-amber-400 text-zinc-300 rounded"
                  >
                    EDIT
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
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
