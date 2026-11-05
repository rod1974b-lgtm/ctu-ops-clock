// src/routes/index.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SamsungTimePicker, type SamsungTimePickerValues } from "@/components/samsung-time-picker";
import { CTUAudio } from "@/lib/ctu-audio";

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
  armed: boolean;
}

const CTU_PRESETS = [
  { id: "sprint", label: "TACTICAL SPRINT", durationSec: 25 * 60 },
  { id: "interrogate", label: "INTERROGATION", durationSec: 15 * 60 },
  { id: "satellite", label: "SATELLITE PASS", durationSec: 45 * 60 },
  { id: "standdown", label: "FIELD STAND-DOWN", durationSec: 5 * 60 },
];

const DEFAULT_TIMERS: OperationalTimer[] = [
  {
    id: "timer-alpha",
    label: "PRIMARY OPERATION ALPHA",
    durationSec: 300,
    remainingSec: 300,
    running: false,
    timesUp: false,
    status: "READY - CLICK NUMBERS TO SET",
  },
];

const DEFAULT_ALARMS: OperationalAlarm[] = [
  {
    id: "alarm-main",
    label: "DAILY DEPLOYMENT ALARM",
    hour: 19,
    minute: 38,
    armed: true,
  },
];

export function CTUTerminalV74() {
  // Live clock
  const [now, setNow] = useState<Date>(() => new Date());

  // Timers & Alarms State
  const [timers, setTimers] = useState<OperationalTimer[]>(DEFAULT_TIMERS);
  const [alarms, setAlarms] = useState<OperationalAlarm[]>(DEFAULT_ALARMS);
  const [timerVol, setTimerVol] = useState<number>(0.85);

  // Alarms trigger tracking
  const triggeredAlarmsRef = useRef<Set<string>>(new Set());

  // Zero sound preference
  const [zeroSound, setZeroSound] = useState<ZeroSoundType>("voice");

  // Modal State for Samsung Time Picker
  type ModalTarget =
    | { type: "timer-edit"; id: string }
    | { type: "timer-new" }
    | { type: "alarm-edit"; id: string }
    | { type: "alarm-new" }
    | null;

  const [modalTarget, setModalTarget] = useState<ModalTarget>(null);
  const [pickerFocusUnit, setPickerFocusUnit] = useState<"hours" | "minutes" | "seconds">("minutes");

  // Video Modals
  const [activeVideoModal, setActiveVideoModal] = useState<"opening" | "credits" | null>(null);

  // Fullscreen Countdown Takeover
  const [takeoverActive, setTakeoverActive] = useState<boolean>(false);
  const [takeoverRemaining, setTakeoverRemaining] = useState<number>(10);
  const [takeoverLabel, setTakeoverLabel] = useState<string>("PRIMARY OPERATION");

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Audio Engine & Intervals
  const audioRef = useRef<CTUAudio | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const takeoverIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const takeoverCallbackRef = useRef<(() => void) | null>(null);

  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new CTUAudio();
    }
    return audioRef.current;
  }, []);

  const showToast = useCallback((msg: string, durationMs = 2500) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, durationMs);
  }, []);

  // Hydrate from localStorage
  useEffect(() => {
    try {
      const savedTimers = localStorage.getItem("ctu-v74-timers");
      if (savedTimers) {
        const parsed = JSON.parse(savedTimers);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTimers(parsed.map((t) => ({ ...t, running: false })));
        }
      }
      const savedAlarms = localStorage.getItem("ctu-v74-alarms");
      if (savedAlarms) {
        const parsed = JSON.parse(savedAlarms);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setAlarms(parsed);
        }
      }
    } catch {
      // Ignore parse error
    }
  }, []);

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("ctu-v74-timers", JSON.stringify(timers));
    } catch {
      // Quota exceeded
    }
  }, [timers]);

  useEffect(() => {
    try {
      localStorage.setItem("ctu-v74-alarms", JSON.stringify(alarms));
    } catch {
      // Quota exceeded
    }
  }, [alarms]);

  // Live clock tick
  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date());
    }, 250);
    return () => clearInterval(id);
  }, []);

  // Format Bangkok time (UTC+7)
  const bangkokDate = useMemo(() => {
    return new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  }, [now]);

  const liveTime = useMemo(() => {
    const h = String(bangkokDate.getHours()).padStart(2, "0");
    const m = String(bangkokDate.getMinutes()).padStart(2, "0");
    const s = String(bangkokDate.getSeconds()).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }, [bangkokDate]);

  const liveDay = useMemo(() => {
    return bangkokDate.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  }, [bangkokDate]);

  const liveDate = useMemo(() => {
    return bangkokDate
      .toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      })
      .toUpperCase();
  }, [bangkokDate]);

  // Audio synthesis zero sounds
  const triggerZeroSound = useCallback(() => {
    try {
      const audio = getAudio();
      audio.setVolume(timerVol);
      const ctx = audio.getAudioContext();
      if (!ctx) return;
      const t = ctx.currentTime;

      if (zeroSound === "voice") {
        audio.playZeroTheme();
        return;
      }

      if (zeroSound === "boom") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(140, t);
        osc.frequency.exponentialRampToValueAtTime(32, t + 1.2);
        gain.gain.setValueAtTime(timerVol * 1.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 1.5);
        return;
      }

      if (zeroSound === "alarm") {
        for (let i = 0; i < 4; i++) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const st = t + i * 0.28;
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(880, st);
          osc.frequency.exponentialRampToValueAtTime(440, st + 0.2);
          gain.gain.setValueAtTime(timerVol * 0.8, st);
          gain.gain.exponentialRampToValueAtTime(0.001, st + 0.24);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(st);
          osc.stop(st + 0.25);
        }
        return;
      }

      if (zeroSound === "ctu_beep") {
        for (let i = 0; i < 3; i++) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const st = t + i * 0.18;
          osc.type = "sine";
          osc.frequency.setValueAtTime(1760, st);
          gain.gain.setValueAtTime(timerVol * 0.9, st);
          gain.gain.exponentialRampToValueAtTime(0.001, st + 0.12);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(st);
          osc.stop(st + 0.14);
        }
        return;
      }

      if (zeroSound === "stinger") {
        const freqs = [220, 277.18, 329.63, 415.3];
        freqs.forEach((f) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(f, t);
          gain.gain.setValueAtTime((timerVol * 0.7) / freqs.length, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 1.9);
        });
      }
    } catch (e) {
      console.warn("Zero sound error:", e);
    }
  }, [getAudio, zeroSound, timerVol]);

  // Takeover controls
  const startTakeover = useCallback(
    (durationSec = 10, label = "COUNTDOWN", onComplete?: () => void) => {
      if (takeoverIntervalRef.current) clearInterval(takeoverIntervalRef.current);
      setTakeoverActive(true);
      setTakeoverRemaining(durationSec);
      setTakeoverLabel(label);
      takeoverCallbackRef.current = onComplete ?? null;

      const audio = getAudio();
      audio.setVolume(timerVol);
      audio.playCountdownAlert();

      takeoverIntervalRef.current = setInterval(() => {
        setTakeoverRemaining((prev) => {
          if (prev <= 1) {
            if (takeoverIntervalRef.current) clearInterval(takeoverIntervalRef.current);
            setTakeoverActive(false);
            audio.stopCountdownAlert();
            triggerZeroSound();
            if (takeoverCallbackRef.current) {
              takeoverCallbackRef.current();
              takeoverCallbackRef.current = null;
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
    [getAudio, timerVol, triggerZeroSound]
  );

  const cancelTakeover = useCallback(() => {
    if (takeoverIntervalRef.current) clearInterval(takeoverIntervalRef.current);
    setTakeoverActive(false);
    const audio = getAudio();
    audio.stopCountdownAlert();
    audio.stopZeroTheme();
    showToast("COUNTDOWN DISARMED", 2000);
  }, [getAudio, showToast]);

  // Timers countdown ticker
  useEffect(() => {
    const hasRunning = timers.some((t) => t.running);
    if (!hasRunning) {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      return;
    }

    timerIntervalRef.current = setInterval(() => {
      setTimers((prevTimers) =>
        prevTimers.map((timer) => {
          if (!timer.running) return timer;

          if (timer.remainingSec <= 1) {
            triggerZeroSound();
            showToast(`${timer.label} — TIME'S UP!`, 4000);
            return {
              ...timer,
              remainingSec: 0,
              running: false,
              timesUp: true,
              status: "TIME'S UP",
            };
          }

          if (timer.remainingSec === 11) {
            startTakeover(10, timer.label, () => {
              setTimers((current) =>
                current.map((t) =>
                  t.id === timer.id
                    ? { ...t, remainingSec: 0, running: false, timesUp: true, status: "TIME'S UP" }
                    : t
                )
              );
            });
          }

          return { ...timer, remainingSec: timer.remainingSec - 1 };
        })
      );
    }, 1000);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [timers, startTakeover, triggerZeroSound, showToast]);

  // Background Alarm Checker
  useEffect(() => {
    const curH = bangkokDate.getHours();
    const curM = bangkokDate.getMinutes();
    const curS = bangkokDate.getSeconds();

    alarms.forEach((alarm) => {
      const matchKey = `${alarm.id}-${curH}:${curM}`;
      if (
        alarm.armed &&
        curH === alarm.hour &&
        curM === alarm.minute &&
        curS === 0 &&
        !triggeredAlarmsRef.current.has(matchKey)
      ) {
        triggeredAlarmsRef.current.add(matchKey);
        startTakeover(10, `ALARM TARGET: ${alarm.label}`, () => {
          showToast(`ALARM ENGAGED: ${alarm.label}`, 4000);
        });
      }
    });

    if (curS === 30) {
      triggeredAlarmsRef.current.clear();
    }
  }, [bangkokDate, alarms, startTakeover, showToast]);

  // Formatting helpers
  const formatHMS = (totalSec: number) => {
    const h = String(Math.floor(totalSec / 3600)).padStart(2, "0");
    const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
    const s = String(totalSec % 60).padStart(2, "0");
    return { h, m, s, text: `${h}:${m}:${s}` };
  };

  const formatHM = (h: number, m: number) => {
    const hs = String(h).padStart(2, "0");
    const ms = String(m).padStart(2, "0");
    return { h: hs, m: ms, text: `${hs}:${ms}` };
  };

  // Timer Controls
  const startTimer = (id: string) => {
    setTimers((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        if (t.remainingSec <= 0) {
          showToast("SET DURATION FIRST", 2000);
          return t;
        }
        return { ...t, running: true, timesUp: false, status: "RUNNING - TACTICAL ENGAGED" };
      })
    );
    getAudio().unlockAudio();
    showToast("OPERATION TIMER ENGAGED", 1500);
  };

  const stopTimer = (id: string) => {
    setTimers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, running: false, status: "PAUSED" } : t))
    );
    const audio = getAudio();
    audio.stopCountdownAlert();
    audio.stopZeroTheme();
    showToast("TIMER PAUSED", 1500);
  };

  const resetTimer = (id: string) => {
    setTimers((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              running: false,
              timesUp: false,
              remainingSec: t.durationSec,
              status: "READY - CLICK NUMBERS TO SET",
            }
          : t
      )
    );
    const audio = getAudio();
    audio.stopCountdownAlert();
    audio.stopZeroTheme();
    showToast("TIMER RESET TO DURATION", 1500);
  };

  const deleteTimer = (id: string) => {
    setTimers((prev) => {
      if (prev.length <= 1) {
        showToast("AT LEAST ONE OPERATION TIMER IS REQUIRED", 2000);
        return prev;
      }
      return prev.filter((t) => t.id !== id);
    });
    showToast("OPERATION TIMER DELETED", 1500);
  };

  const addPresetTimer = (preset: (typeof CTU_PRESETS)[0]) => {
    const newTimer: OperationalTimer = {
      id: `timer-${Date.now()}`,
      label: preset.label,
      durationSec: preset.durationSec,
      remainingSec: preset.durationSec,
      running: false,
      timesUp: false,
      status: "ARMED FROM PRESET",
    };
    setTimers((prev) => [newTimer, ...prev]);
    showToast(`ARMED: ${preset.label}`, 2000);
  };

  // Alarm Controls
  const toggleAlarmArmed = (id: string) => {
    setAlarms((prev) =>
      prev.map((a) => (a.id === id ? { ...a, armed: !a.armed } : a))
    );
    getAudio().unlockAudio();
    showToast("ALARM STATUS UPDATED", 1500);
  };

  const deleteAlarm = (id: string) => {
    setAlarms((prev) => {
      if (prev.length <= 1) {
        showToast("AT LEAST ONE ALARM PROTOCOL IS REQUIRED", 2000);
        return prev;
      }
      return prev.filter((a) => a.id !== id);
    });
    showToast("ALARM REMOVED", 1500);
  };

  // Ordered timers: prioritize active running timers with lowest remaining time
  const sortedTimers = useMemo(() => {
    return [...timers].sort((a, b) => {
      if (a.running && !b.running) return -1;
      if (!a.running && b.running) return 1;
      return a.remainingSec - b.remainingSec;
    });
  }, [timers]);

  const focusedTimer = sortedTimers[0] ?? timers[0];

  // Samsung Picker Save
  const handleModalSave = useCallback(
    (values: SamsungTimePickerValues) => {
      if (!modalTarget) return;

      if (modalTarget.type === "timer-edit") {
        const total = values.totalSeconds;
        if (total <= 0) {
          showToast("SET A VALID DURATION", 2000);
          return;
        }
        setTimers((prev) =>
          prev.map((t) =>
            t.id === modalTarget.id
              ? {
                  ...t,
                  durationSec: total,
                  remainingSec: total,
                  running: false,
                  timesUp: false,
                  status: "READY - CLICK NUMBERS TO SET",
                }
              : t
          )
        );
        showToast(`TIMER SET: ${formatHMS(total).text}`, 2000);
      } else if (modalTarget.type === "timer-new") {
        const total = values.totalSeconds;
        if (total <= 0) {
          showToast("SET A VALID DURATION", 2000);
          return;
        }
        const newTimer: OperationalTimer = {
          id: `timer-${Date.now()}`,
          label: `TACTICAL OP ${timers.length + 1}`,
          durationSec: total,
          remainingSec: total,
          running: false,
          timesUp: false,
          status: "READY - CLICK NUMBERS TO SET",
        };
        setTimers((prev) => [newTimer, ...prev]);
        showToast(`NEW OPERATION ARMED: ${formatHMS(total).text}`, 2000);
      } else if (modalTarget.type === "alarm-edit") {
        setAlarms((prev) =>
          prev.map((a) =>
            a.id === modalTarget.id
              ? { ...a, hour: values.hours, minute: values.minutes, armed: true }
              : a
          )
        );
        showToast(`ALARM SET: ${formatHM(values.hours, values.minutes).text}`, 2000);
      } else if (modalTarget.type === "alarm-new") {
        const newAlarm: OperationalAlarm = {
          id: `alarm-${Date.now()}`,
          label: `ALARM ${alarms.length + 1}`,
          hour: values.hours,
          minute: values.minutes,
          armed: true,
        };
        setAlarms((prev) => [...prev, newAlarm]);
        showToast(`NEW ALARM ARMED: ${formatHM(values.hours, values.minutes).text}`, 2000);
      }

      setModalTarget(null);
    },
    [modalTarget, timers.length, alarms.length, showToast]
  );

  // Initial picker values
  const pickerInitials = useMemo(() => {
    if (!modalTarget) return { hours: 0, minutes: 5, seconds: 0 };
    if (modalTarget.type === "timer-edit") {
      const t = timers.find((x) => x.id === modalTarget.id);
      if (t) {
        return {
          hours: Math.floor(t.durationSec / 3600),
          minutes: Math.floor((t.durationSec % 3600) / 60),
          seconds: t.durationSec % 60,
        };
      }
    }
    if (modalTarget.type === "alarm-edit") {
      const a = alarms.find((x) => x.id === modalTarget.id);
      if (a) {
        return { hours: a.hour, minutes: a.minute, seconds: 0 };
      }
    }
    return { hours: 0, minutes: 5, seconds: 0 };
  }, [modalTarget, timers, alarms]);

  return (
    <div
      className="min-h-screen bg-black text-[#ffcc00] selection:bg-[#ffcc00] selection:text-black"
      style={{ fontFamily: 'Consolas, "Courier New", monospace' }}
    >
      {/* STICKY LIVE CLOCK HEADER */}
      <header className="sticky top-0 z-40 bg-black border-b border-[#ffcc00]/20 backdrop-blur-[2px]">
        <div className="max-w-[980px] mx-auto px-3 py-3 flex flex-col gap-1">
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="text-[11px] tracking-[0.3em] opacity-70">LIVE</span>
            <div
              className="glow font-black leading-none tracking-tight"
              style={{ fontSize: "clamp(48px, 11vw, 96px)", lineHeight: "0.85", color: "#ffcc00" }}
            >
              {liveTime}
            </div>
            <div className="ml-auto flex flex-col text-right">
              <span className="text-[10px] tracking-widest opacity-60">{liveDay}</span>
              <span className="text-[9px] tracking-wide opacity-50 max-w-[220px]">{liveDate}</span>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN OPERATIONS VIEWPORT */}
      <main className="max-w-[980px] mx-auto px-3 py-4 flex flex-col gap-4">
        {/* DUAL CINEMATIC BUTTONS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveVideoModal("opening")}
            className="w-full bg-[#ffcc00] text-black font-black tracking-[0.14em] text-[17px] md:text-[18px] rounded-[8px] border-2 border-[#ffcc00] hover:bg-black hover:text-[#ffcc00] transition-colors min-h-[44px] py-3 shadow-[0_0_18px_rgba(255,204,0,0.35)] cursor-pointer"
          >
            START 24 OPENING
          </button>
          <button
            type="button"
            onClick={() => setActiveVideoModal("credits")}
            className="w-full bg-black text-[#ffcc00] font-black tracking-[0.14em] text-[17px] md:text-[18px] rounded-[8px] border-2 border-[#ffcc00] hover:bg-[#ffcc00] hover:text-black transition-colors min-h-[44px] py-3 shadow-[0_0_14px_rgba(255,204,0,0.25)] cursor-pointer"
          >
            ENDING CREDITS
          </button>
        </div>

        {/* ================= PRIMARY FOCUSED TIMER ================= */}
        {focusedTimer && (
          <div className="relative border-2 border-dashed border-[#ffcc00] rounded-[14px] p-3 md:p-4 bg-[#050500] min-h-[90px] flex flex-col gap-0 shadow-[0_0_20px_rgba(255,204,0,0.12)]">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black tracking-[0.25em] text-[#ffcc00]">
                  PRIMARY FOCUS: {focusedTimer.label}
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#ffcc00]/20 text-[#ffcc00] font-bold">
                  CLOSEST
                </span>
              </div>
              <span
                className={`text-[10px] px-2 py-[2px] rounded border ${
                  focusedTimer.running
                    ? "border-green-400 text-green-400"
                    : focusedTimer.timesUp
                      ? "border-[#ffcc00] text-[#ffcc00]"
                      : "border-[#ffcc00]/40 text-[#ffcc00]/60"
                }`}
              >
                {focusedTimer.running ? "RUNNING" : focusedTimer.timesUp ? "TIME'S UP" : "IDLE"}
              </span>
            </div>

            {/* Segmented Clickable Time Readout (Hours, Minutes, Seconds) */}
            {(() => {
              const hms = formatHMS(focusedTimer.remainingSec);
              return (
                <div className="mt-3 py-3 px-2 border border-[#ffcc00]/30 rounded-[10px] bg-black flex flex-col items-center">
                  <div className="flex items-center justify-center gap-1.5 md:gap-3 flex-wrap">
                    {/* Hours Block */}
                    <button
                      type="button"
                      onClick={() => {
                        setPickerFocusUnit("hours");
                        setModalTarget({ type: "timer-edit", id: focusedTimer.id });
                      }}
                      className="group flex flex-col items-center px-3 py-1.5 rounded-[8px] border border-transparent hover:border-[#ffcc00] hover:bg-[#1a1a00] active:scale-95 transition-all cursor-pointer"
                    >
                      <span className="text-[38px] md:text-[46px] font-black tracking-widest leading-none text-[#ffcc00] group-hover:drop-shadow-[0_0_14px_rgba(255,204,0,0.8)]">
                        {hms.h}
                      </span>
                      <span className="text-[8px] md:text-[9px] tracking-widest text-[#ffcc00]/60 font-bold mt-1">
                        HOURS
                      </span>
                    </button>

                    <span className="text-[32px] md:text-[40px] font-black text-[#ffcc00] pb-4">:</span>

                    {/* Minutes Block */}
                    <button
                      type="button"
                      onClick={() => {
                        setPickerFocusUnit("minutes");
                        setModalTarget({ type: "timer-edit", id: focusedTimer.id });
                      }}
                      className="group flex flex-col items-center px-3 py-1.5 rounded-[8px] border border-transparent hover:border-[#ffcc00] hover:bg-[#1a1a00] active:scale-95 transition-all cursor-pointer"
                    >
                      <span className="text-[38px] md:text-[46px] font-black tracking-widest leading-none text-[#ffcc00] group-hover:drop-shadow-[0_0_14px_rgba(255,204,0,0.8)]">
                        {hms.m}
                      </span>
                      <span className="text-[8px] md:text-[9px] tracking-widest text-[#ffcc00]/60 font-bold mt-1">
                        MINUTES
                      </span>
                    </button>

                    <span className="text-[32px] md:text-[40px] font-black text-[#ffcc00] pb-4">:</span>

                    {/* Seconds Block */}
                    <button
                      type="button"
                      onClick={() => {
                        setPickerFocusUnit("seconds");
                        setModalTarget({ type: "timer-edit", id: focusedTimer.id });
                      }}
                      className="group flex flex-col items-center px-3 py-1.5 rounded-[8px] border border-transparent hover:border-[#ffcc00] hover:bg-[#1a1a00] active:scale-95 transition-all cursor-pointer"
                    >
                      <span className="text-[38px] md:text-[46px] font-black tracking-widest leading-none text-[#ffcc00] group-hover:drop-shadow-[0_0_14px_rgba(255,204,0,0.8)]">
                        {hms.s}
                      </span>
                      <span className="text-[8px] md:text-[9px] tracking-widest text-[#ffcc00]/60 font-bold mt-1">
                        SECONDS
                      </span>
                    </button>
                  </div>
                  <div className="text-[10px] opacity-60 mt-1 tracking-widest">
                    TAP HOURS, MINUTES, OR SECONDS TO RECONFIGURE
                  </div>
                </div>
              );
            })()}

            {/* Progress Bar */}
            {(() => {
              const elapsed = focusedTimer.durationSec - focusedTimer.remainingSec;
              const pct =
                focusedTimer.durationSec > 0
                  ? Math.min(100, Math.max(0, (elapsed / focusedTimer.durationSec) * 100))
                  : 0;
              return (
                <div className="mt-3 h-[6px] w-full bg-[#1a1a00] rounded overflow-hidden border border-[#ffcc00]/20">
                  <div
                    className="h-full bg-[#ffcc00] transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              );
            })()}

            {/* Status Line */}
            <div className="mt-2 text-[11px] tracking-wide opacity-70 min-h-[18px] w-full text-left">
              {focusedTimer.status}
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-4 gap-2 mt-3 w-full">
              <button
                type="button"
                onClick={() => startTimer(focusedTimer.id)}
                className="bg-[#00c853] text-black font-bold min-h-[44px] rounded-[6px] text-[13px] tracking-widest hover:brightness-110 active:scale-[0.98] whitespace-nowrap overflow-hidden cursor-pointer"
              >
                START
              </button>
              <button
                type="button"
                onClick={() => stopTimer(focusedTimer.id)}
                className="bg-black border border-[#ffcc00] text-[#ffcc00] font-bold min-h-[44px] rounded-[6px] text-[13px] tracking-widest hover:bg-[#1a1a00] active:scale-[0.98] whitespace-nowrap overflow-hidden cursor-pointer"
              >
                STOP
              </button>
              <button
                type="button"
                onClick={() => resetTimer(focusedTimer.id)}
                className="bg-[#ffcc00] text-black font-bold min-h-[44px] rounded-[6px] text-[13px] tracking-widest hover:bg-[#ffcc00]/80 active:scale-[0.98] whitespace-nowrap overflow-hidden cursor-pointer"
              >
                RESET
              </button>
              <button
                type="button"
                onClick={() => deleteTimer(focusedTimer.id)}
                className="bg-red-950 border border-red-500 text-red-400 font-bold min-h-[44px] rounded-[6px] text-[11px] md:text-[12px] tracking-widest hover:bg-red-900 active:scale-[0.98] whitespace-nowrap overflow-hidden cursor-pointer"
              >
                DELETE
              </button>
            </div>
          </div>
        )}

        {/* ================= ALL OPERATIONAL TIMERS QUEUE ================= */}
        <div className="border border-[#ffcc00]/30 rounded-[12px] p-3 bg-black/60 flex flex-col gap-3">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <span className="text-[11px] tracking-[0.25em] font-black text-[#ffcc00]">
              ACTIVE MISSIONS &amp; TIMERS ({timers.length})
            </span>
            <button
              type="button"
              onClick={() => {
                setPickerFocusUnit("minutes");
                setModalTarget({ type: "timer-new" });
              }}
              className="bg-[#ffcc00] text-black font-black text-[11px] px-3 py-1.5 rounded tracking-widest hover:bg-white transition-colors cursor-pointer"
            >
              + ADD NEW TIMER
            </button>
          </div>

          {/* Quick CTU Presets Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CTU_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => addPresetTimer(preset)}
                className="px-2 py-2 rounded bg-[#111] border border-[#ffcc00]/30 hover:border-[#ffcc00] hover:bg-[#1a1a00] text-[10px] font-bold tracking-widest text-[#ffcc00] transition-colors text-left flex flex-col cursor-pointer"
              >
                <span className="truncate">{preset.label}</span>
                <span className="text-[9px] opacity-60">{preset.durationSec / 60} MIN</span>
              </button>
            ))}
          </div>

          {/* Secondary Timers Stack */}
          <div className="flex flex-col gap-2 mt-1">
            {timers.map((t) => {
              const hms = formatHMS(t.remainingSec);
              const isFocused = t.id === focusedTimer?.id;
              return (
                <div
                  key={t.id}
                  className={`p-2.5 rounded-[8px] border transition-colors flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 ${
                    isFocused
                      ? "border-[#ffcc00] bg-[#111100]"
                      : "border-[#ffcc00]/25 bg-black hover:border-[#ffcc00]/50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setPickerFocusUnit("minutes");
                        setModalTarget({ type: "timer-edit", id: t.id });
                      }}
                      className="flex items-center gap-1 font-black text-[22px] tracking-wider text-[#ffcc00] px-2 py-1 rounded bg-[#050500] border border-[#ffcc00]/30 hover:border-[#ffcc00] cursor-pointer"
                    >
                      <span>{hms.h}</span>:<span>{hms.m}</span>:<span>{hms.s}</span>
                    </button>
                    <div className="flex flex-col">
                      <span className="text-[12px] font-bold tracking-wider text-white">
                        {t.label}
                      </span>
                      <span className="text-[9px] tracking-widest opacity-60">
                        {t.running ? "ACTIVE" : t.timesUp ? "TIME'S UP" : "PAUSED"} — {t.status}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end md:self-auto">
                    {t.running ? (
                      <button
                        type="button"
                        onClick={() => stopTimer(t.id)}
                        className="px-2.5 py-1 text-[11px] font-bold rounded border border-[#ffcc00] bg-black text-[#ffcc00] hover:bg-[#1a1a00] cursor-pointer"
                      >
                        STOP
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startTimer(t.id)}
                        className="px-2.5 py-1 text-[11px] font-bold rounded bg-[#00c853] text-black hover:brightness-110 cursor-pointer"
                      >
                        START
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => resetTimer(t.id)}
                      className="px-2.5 py-1 text-[11px] font-bold rounded bg-[#ffcc00] text-black hover:bg-[#ffcc00]/80 cursor-pointer"
                    >
                      RESET
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteTimer(t.id)}
                      className="px-2 py-1 text-[11px] font-bold rounded border border-red-500/50 text-red-400 hover:bg-red-950 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ================= MULTIPLE DAILY ALARMS PANEL ================= */}
        <div className="relative border-2 border-dashed border-[#ffcc00] rounded-[14px] p-3 md:p-4 bg-[#050500] min-h-[90px] flex flex-col gap-3">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <span className="text-[10px] tracking-[0.25em] opacity-80 font-black">
              DAILY 24HR ALARMS ({alarms.length}) — BANGKOK THEATER (UTC+7)
            </span>
            <button
              type="button"
              onClick={() => {
                setPickerFocusUnit("hours");
                setModalTarget({ type: "alarm-new" });
              }}
              className="bg-[#ffcc00] text-black font-black text-[11px] px-3 py-1.5 rounded tracking-widest hover:bg-white transition-colors cursor-pointer"
            >
              + ARM NEW ALARM
            </button>
          </div>

          {/* Alarm Cards Stack */}
          <div className="flex flex-col gap-2.5">
            {alarms.map((alarm) => {
              const hm = formatHM(alarm.hour, alarm.minute);
              return (
                <div
                  key={alarm.id}
                  className="p-3 rounded-[10px] border border-[#ffcc00]/30 bg-black flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    {/* Clickable Alarm HH:MM */}
                    <button
                      type="button"
                      onClick={() => {
                        setPickerFocusUnit("hours");
                        setModalTarget({ type: "alarm-edit", id: alarm.id });
                      }}
                      className="px-3 py-1.5 rounded bg-[#111] border border-[#ffcc00]/40 hover:border-[#ffcc00] flex items-center gap-1 font-black text-[28px] md:text-[32px] text-[#ffcc00] leading-none cursor-pointer"
                    >
                      <span>{hm.h}</span>:<span>{hm.m}</span>
                    </button>
                    <div className="flex flex-col">
                      <span className="text-[12px] font-bold tracking-wider text-white">
                        {alarm.label}
                      </span>
                      <span className="text-[9px] tracking-widest opacity-60">
                        {alarm.armed ? "ACTIVE PROTOCOL — ENGAGED" : "STANDBY — DISARMED"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => toggleAlarmArmed(alarm.id)}
                      className={`px-3 py-1.5 text-[11px] font-bold tracking-wider rounded cursor-pointer ${
                        alarm.armed
                          ? "bg-[#00c853] text-black hover:brightness-110"
                          : "bg-black border border-[#ffcc00]/50 text-[#ffcc00]/60 hover:border-[#ffcc00]"
                      }`}
                    >
                      {alarm.armed ? "ARMED" : "OFF"}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteAlarm(alarm.id)}
                      className="px-2.5 py-1.5 text-[11px] font-bold rounded border border-red-500/50 text-red-400 hover:bg-red-950 cursor-pointer"
                    >
                      DELETE
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ================= AUDIO & KLAXON CONFIGURATION ================= */}
        <div className="border border-[#ffcc00]/30 rounded-[12px] p-3 bg-black/60 flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <span className="text-[10px] tracking-[0.25em] font-bold text-[#ffcc00]">
              TACTICAL AUDIO &amp; AT ZERO KLAXON
            </span>
          </div>

          {/* Quick Countdown Trigger */}
          <button
            type="button"
            onClick={() => {
              startTakeover(10, "MANUAL COUNTDOWN TEST", () => {
                showToast("TIME'S UP", 3000);
              });
            }}
            className="min-h-[44px] rounded-[6px] font-bold text-[11px] md:text-[12px] tracking-widest bg-[#ffcc00] text-black border-2 border-[#ffcc00] hover:bg-black hover:text-[#ffcc00] px-2 whitespace-normal leading-tight cursor-pointer"
          >
            MANUAL OVERRIDE — TRIGGER 10→0 COUNTDOWN &amp; {ZERO_SOUND_LABELS[zeroSound]}
          </button>

          {/* Volume Slider */}
          <div className="flex items-center gap-3">
            <span className="text-[10px] w-[50px] opacity-60">VOLUME</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={timerVol}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setTimerVol(val);
                if (audioRef.current) audioRef.current.setVolume(val);
              }}
              className="flex-1 cursor-pointer"
            />
            <span className="text-[11px] w-[30px] text-right">{timerVol.toFixed(2)}</span>
          </div>

          {/* At Zero Selector */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-1.5">
            {(["voice", "boom", "alarm", "ctu_beep", "stinger"] as ZeroSoundType[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setZeroSound(key);
                  showToast(`ZERO: ${ZERO_SOUND_LABELS[key]}`, 1500);
                }}
                className={`min-h-[38px] rounded-[6px] text-[10px] md:text-[11px] font-bold tracking-widest border transition-colors cursor-pointer ${
                  zeroSound === key
                    ? "bg-[#ffcc00] text-black border-[#ffcc00] shadow-[0_0_12px_rgba(255,204,0,0.4)]"
                    : "bg-black text-[#ffcc00] border-[#ffcc00]/40 hover:bg-[#1a1a00]"
                }`}
              >
                {ZERO_SOUND_LABELS[key]}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 mt-1">
            <button
              type="button"
              onClick={() => {
                triggerZeroSound();
                showToast(`TESTING: ${ZERO_SOUND_LABELS[zeroSound]}`, 2000);
              }}
              className="min-h-[38px] rounded-[6px] text-[11px] font-bold tracking-widest bg-[#ffcc00] text-black hover:bg-[#ffcc00]/80 transition-colors cursor-pointer"
            >
              TEST {ZERO_SOUND_LABELS[zeroSound]}
            </button>
            <button
              type="button"
              onClick={() => {
                const audio = getAudio();
                audio.stopZeroTheme();
                showToast("SOUND STOPPED", 1500);
              }}
              className="min-h-[38px] rounded-[6px] text-[11px] font-bold tracking-widest bg-black border border-[#ffcc00] text-[#ffcc00] hover:bg-[#1a1a00] transition-colors cursor-pointer"
            >
              STOP AUDIO
            </button>
          </div>
        </div>
      </main>

      {/* FULLSCREEN 10-TO-0 TAKEOVER OVERLAY */}
      {takeoverActive && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[99999] bg-black/95 flex flex-col items-center justify-between p-4 md:p-8 select-none"
        >
          {/* Header */}
          <div className="w-full max-w-[800px] flex justify-between items-center border-b border-[#ffcc00]/30 pb-3">
            <span className="text-[12px] tracking-[0.3em] font-black text-[#ffcc00]">
              CRITICAL TIMING PROTOCOL
            </span>
            <span className="text-[11px] px-2 py-1 rounded bg-[#ffcc00] text-black font-black tracking-widest">
              {takeoverLabel}
            </span>
          </div>

          {/* Giant Countdown Digit */}
          <div className="flex flex-col items-center justify-center my-auto">
            <div className="text-[14px] md:text-[18px] tracking-[0.4em] font-bold text-[#ffcc00]/70 mb-2">
              SECONDS TO ZERO
            </div>
            <div
              className={`font-black leading-none tracking-tight select-none ${
                takeoverRemaining <= 3 ? "text-red-500" : "text-[#ffcc00] glow"
              }`}
              style={{ fontSize: "clamp(120px, 28vw, 240px)", lineHeight: "0.85" }}
            >
              {String(takeoverRemaining).padStart(2, "0")}
            </div>
            <div className="text-[11px] tracking-[0.3em] opacity-60 mt-4 text-[#ffcc00]">
              TACTICAL KLAXON ACTIVE
            </div>
          </div>

          {/* Disarm Button */}
          <div className="w-full max-w-[420px] flex flex-col gap-3">
            <button
              type="button"
              onClick={cancelTakeover}
              className="w-full bg-red-600 hover:bg-red-500 text-white font-black text-[16px] tracking-[0.2em] py-4 rounded-[8px] active:scale-[0.98] transition-all shadow-[0_0_30px_rgba(255,0,0,0.5)] cursor-pointer"
            >
              ABORT &amp; DISARM
            </button>
            <div className="text-center text-[9px] tracking-widest text-[#ffcc00]/40">
              DISARM CLEARS TAKEOVER AUDIO &amp; RESETS MONITOR
            </div>
          </div>
        </div>
      )}

      {/* SAMSUNG GALAXY SLIDE DRUM PICKER MODAL */}
      {modalTarget && (
        <div className="fixed inset-0 z-[10000] bg-black/75 backdrop-blur-[3px] flex items-center justify-center p-3">
          <SamsungTimePicker
            mode={modalTarget.type.startsWith("timer") ? "timer" : "alarm"}
            initialHours={pickerInitials.hours}
            initialMinutes={pickerInitials.minutes}
            initialSeconds={pickerInitials.seconds}
            initialFocus={pickerFocusUnit}
            onSave={handleModalSave}
            onCancel={() => setModalTarget(null)}
          />
        </div>
      )}

      {/* FULLSCREEN VIDEO MODALS */}
      {activeVideoModal && (
        <div className="fixed inset-0 z-[9999] bg-black/95 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-[900px] flex flex-col gap-3">
            <div className="flex justify-between items-center text-[#ffcc00]">
              <span className="text-[13px] tracking-widest font-bold">
                {activeVideoModal === "opening" ? "24 SEASON OPENING SEQUENCE" : "24 CLOSING CREDITS"}
              </span>
              <button
                type="button"
                onClick={() => setActiveVideoModal(null)}
                className="px-3 py-1 bg-black border border-[#ffcc00] text-[#ffcc00] font-bold text-[12px] hover:bg-[#ffcc00] hover:text-black rounded cursor-pointer"
              >
                CLOSE [ESC]
              </button>
            </div>
            <div className="aspect-video w-full bg-black border-2 border-[#ffcc00] rounded-[10px] overflow-hidden">
              <video
                src={activeVideoModal === "opening" ? "/24 Opening.mp4" : "/24 Closing.mp4"}
                controls
                autoPlay
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[20000] bg-black border-2 border-[#ffcc00] text-[#ffcc00] px-5 py-2.5 rounded-full font-black text-[12px] tracking-[0.2em] shadow-[0_0_24px_rgba(255,204,0,0.5)]">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
