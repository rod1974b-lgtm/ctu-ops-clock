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

// All 32 high-resolution watercolor artworks extracted from CTU archive
const WATERCOLOR_IMAGES: string[] = [
  "/24_accurate_watercolors_final/image_20260922_210052.webp",
  "/24_accurate_watercolors_final/image_20260922_210416.webp",
  "/24_accurate_watercolors_final/image_20260922_210429.webp",
  "/24_accurate_watercolors_final/image_20260922_210431.webp",
  "/24_accurate_watercolors_final/image_20260922_210451.webp",
  "/24_accurate_watercolors_final/image_20260922_210847.webp",
  "/24_accurate_watercolors_final/image_20260922_210853.webp",
  "/24_accurate_watercolors_final/image_20260922_211054.webp",
  "/24_accurate_watercolors_final/image_20260923_104544.webp",
  "/24_accurate_watercolors_final/image_20260923_104545.webp",
  "/24_accurate_watercolors_final/image_20260923_104545_1.webp",
  "/24_accurate_watercolors_final/image_20260923_104546_1.webp",
  "/24_accurate_watercolors_final/image_20260923_104548.webp",
  "/24_accurate_watercolors_final/image_20260923_104553.webp",
  "/24_accurate_watercolors_final/image_20260923_104556.webp",
  "/24_accurate_watercolors_final/image_20260923_110610_1.webp",
  "/24_accurate_watercolors_final/image_20260923_112210.webp",
  "/24_accurate_watercolors_final/image_20260923_112211.webp",
  "/24_accurate_watercolors_final/image_20260923_112211_1.webp",
  "/24_accurate_watercolors_final/image_20260923_112218.webp",
  "/24_accurate_watercolors_final/image_20260923_112228.webp",
  "/24_accurate_watercolors_final/image_20260923_112329.webp",
  "/24_accurate_watercolors_final/image_20260923_112330.webp",
  "/24_accurate_watercolors_final/image_20260923_114003.webp",
  "/24_accurate_watercolors_final/image_20260923_114004.webp",
  "/24_accurate_watercolors_final/image_20260923_115411.webp",
  "/24_accurate_watercolors_final/image_20260923_115412.webp",
  "/24_accurate_watercolors_final/image_20260923_115412_2.webp",
  "/24_accurate_watercolors_final/image_20260923_115412_3.webp",
  "/24_accurate_watercolors_final/image_20260923_115419.webp",
  "/24_accurate_watercolors_final/image_20260923_115421.webp",
  "/24_accurate_watercolors_final/image_20260923_120647.webp",
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

  // Video / Ending Credits Modals
  const [activeVideoModal, setActiveVideoModal] = useState<"opening" | "credits" | null>(null);

  // Watercolor Split-Screen Ending Credits State
  const [creditsStep, setCreditsStep] = useState<number>(0);
  const [creditsMusicOn, setCreditsMusicOn] = useState<boolean>(true);
  const [creditsDisplayMode, setCreditsDisplayMode] = useState<"watercolors" | "original">("watercolors");
  const creditsAudioRef = useRef<HTMLAudioElement | null>(null);

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
      audioRef.current.setVolume(timerVol);
    }
    return audioRef.current;
  }, [timerVol]);

  const showToast = useCallback((msg: string, durationMs = 2500) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, durationMs);
  }, []);

  // Hydrate all state from localStorage on initial mount (SSR safe)
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

      const savedVol = localStorage.getItem("ctu-v74-volume");
      if (savedVol !== null) {
        const v = parseFloat(savedVol);
        if (!isNaN(v) && v >= 0 && v <= 1) {
          setTimerVol(v);
          if (audioRef.current) audioRef.current.setVolume(v);
        }
      }

      const savedZeroSound = localStorage.getItem("ctu-v74-zero-sound") as ZeroSoundType | null;
      if (
        savedZeroSound &&
        ["voice", "boom", "alarm", "ctu_beep", "stinger"].includes(savedZeroSound)
      ) {
        setZeroSound(savedZeroSound);
      }

      const savedMusic = localStorage.getItem("ctu-v74-credits-music");
      if (savedMusic !== null) {
        setCreditsMusicOn(savedMusic === "true");
      }

      const savedMode = localStorage.getItem("ctu-v74-credits-mode");
      if (savedMode === "watercolors" || savedMode === "original") {
        setCreditsDisplayMode(savedMode);
      }
    } catch {
      // Ignore parse errors on storage
    }
  }, []);

  // Sync all modified settings and queues to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("ctu-v74-timers", JSON.stringify(timers));
    } catch {
      // Storage quota guard
    }
  }, [timers]);

  useEffect(() => {
    try {
      localStorage.setItem("ctu-v74-alarms", JSON.stringify(alarms));
    } catch {
      // Storage quota guard
    }
  }, [alarms]);

  useEffect(() => {
    try {
      localStorage.setItem("ctu-v74-volume", String(timerVol));
    } catch {
      // Storage quota guard
    }
  }, [timerVol]);

  useEffect(() => {
    try {
      localStorage.setItem("ctu-v74-zero-sound", zeroSound);
    } catch {
      // Storage quota guard
    }
  }, [zeroSound]);

  useEffect(() => {
    try {
      localStorage.setItem("ctu-v74-credits-music", String(creditsMusicOn));
    } catch {
      // Storage quota guard
    }
  }, [creditsMusicOn]);

  useEffect(() => {
    try {
      localStorage.setItem("ctu-v74-credits-mode", creditsDisplayMode);
    } catch {
      // Storage quota guard
    }
  }, [creditsDisplayMode]);

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

  // Dynamic show hours for rolling credits
  const creditsHours = useMemo(() => {
    const curH = bangkokDate.getHours();
    const nextH = (curH + 1) % 24;
    return {
      start: `${String(curH).padStart(2, "0")}:00:00`,
      end: `${String(nextH).padStart(2, "0")}:00:00`,
      endOfHour: `${String(curH).padStart(2, "0")}:59:58`,
    };
  }, [bangkokDate]);

  // Cycle through all 32 watercolors while Ending Credits modal is open
  useEffect(() => {
    if (activeVideoModal !== "credits") return;

    const interval = setInterval(() => {
      setCreditsStep((prev) => (prev + 1) % WATERCOLOR_IMAGES.length);
    }, 4500);

    return () => clearInterval(interval);
  }, [activeVideoModal]);

  // Keyboard shortcut: ESC closes modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveVideoModal(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Zero Sound Trigger (Speaks voice at 0 when zeroSound === "voice")
  const triggerZeroSound = useCallback(() => {
    try {
      const audio = getAudio();
      audio.setVolume(timerVol);

      if (zeroSound === "voice") {
        audio.playZeroVoiceAndTheme();
        return;
      }

      const ctx = audio.getAudioContext();
      if (!ctx) return;
      const t = ctx.currentTime;

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

  // Takeover controls with tiered intensity (1x at 10s, 2x at 5s, 3x at 3s)
  const startTakeover = useCallback(
    (durationSec = 10, label = "COUNTDOWN", onComplete?: () => void) => {
      if (takeoverIntervalRef.current) clearInterval(takeoverIntervalRef.current);
      setTakeoverActive(true);
      setTakeoverRemaining(durationSec);
      setTakeoverLabel(label);
      takeoverCallbackRef.current = onComplete ?? null;

      const audio = getAudio();
      audio.setVolume(timerVol);

      // Determine starting intensity
      const initialIntensity: 1 | 2 | 3 = durationSec <= 3 ? 3 : durationSec <= 5 ? 2 : 1;
      audio.playCountdownAlert(initialIntensity);

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

          const nextSec = prev - 1;
          const currentIntensity: 1 | 2 | 3 = nextSec <= 3 ? 3 : nextSec <= 5 ? 2 : 1;
          audio.playCountdownAlert(currentIntensity);

          return nextSec;
        });
      }, 1000);
    },
    [getAudio, timerVol, triggerZeroSound]
  );

  const cancelTakeover = useCallback(() => {
    if (takeoverIntervalRef.current) clearInterval(takeoverIntervalRef.current);
    setTakeoverActive(false);
    const audio = getAudio();
    audio.stopAll();
    showToast("COUNTDOWN DISARMED", 2000);
  }, [getAudio, showToast]);

  // Timers countdown ticker: starts alert at 10s, doubles at 5s, triples at 3s, speaks voice at 0
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

          // Expiration at zero
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

          const nextRemaining = timer.remainingSec - 1;

          // Engage countdown at 10 seconds
          if (nextRemaining === 10 && !takeoverActive) {
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

          // Escalate audio if takeover is not fullscreen
          if (!takeoverActive && nextRemaining <= 10 && nextRemaining > 0) {
            const intensity: 1 | 2 | 3 = nextRemaining <= 3 ? 3 : nextRemaining <= 5 ? 2 : 1;
            getAudio().playCountdownAlert(intensity);
          }

          return { ...timer, remainingSec: nextRemaining };
        })
      );
    }, 1000);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [timers, takeoverActive, startTakeover, triggerZeroSound, getAudio, showToast]);

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
    const target = timers.find((t) => t.id === id);
    if (!target) return;

    if (target.remainingSec <= 0) {
      showToast("SET DURATION FIRST", 2000);
      return;
    }

    setTimers((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        return { ...t, running: true, timesUp: false, status: "RUNNING - TACTICAL ENGAGED" };
      })
    );
    getAudio().unlockAudio();

    if (target.remainingSec <= 10 && target.remainingSec > 0) {
      startTakeover(target.remainingSec, target.label, () => {
        setTimers((current) =>
          current.map((t) =>
            t.id === id
              ? { ...t, remainingSec: 0, running: false, timesUp: true, status: "TIME'S UP" }
              : t
          )
        );
      });
    }

    showToast("OPERATION TIMER ENGAGED", 1500);
  };

  const stopTimer = (id: string) => {
    setTimers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, running: false, status: "PAUSED" } : t))
    );
    getAudio().stopAll();
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
    getAudio().stopAll();
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
            onClick={() => {
              setCreditsStep(0);
              setActiveVideoModal("credits");
            }}
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

            {/* Segmented Clickable Time Readout (Hours, Minutes, Seconds) - Shakes at <= 3 Seconds */}
            {(() => {
              const hms = formatHMS(focusedTimer.remainingSec);
              const isUrgent =
                focusedTimer.running && focusedTimer.remainingSec <= 3 && focusedTimer.remainingSec > 0;
              const shakeClass = isUrgent
                ? "ctu-shake-intense text-red-500 drop-shadow-[0_0_18px_rgba(255,0,0,0.85)]"
                : "text-[#ffcc00]";

              return (
                <div className="mt-3 py-3 px-2 border border-[#ffcc00]/30 rounded-[10px] bg-black flex flex-col items-center">
                  <div className={`flex items-center justify-center gap-1.5 md:gap-3 flex-wrap ${shakeClass}`}>
                    {/* Hours Block */}
                    <button
                      type="button"
                      onClick={() => {
                        setPickerFocusUnit("hours");
                        setModalTarget({ type: "timer-edit", id: focusedTimer.id });
                      }}
                      className="group flex flex-col items-center px-3 py-1.5 rounded-[8px] border border-transparent hover:border-[#ffcc00] hover:bg-[#1a1a00] active:scale-95 transition-all cursor-pointer"
                    >
                      <span className="text-[38px] md:text-[46px] font-black tracking-widest leading-none group-hover:drop-shadow-[0_0_14px_rgba(255,204,0,0.8)]">
                        {hms.h}
                      </span>
                      <span className="text-[8px] md:text-[9px] tracking-widest opacity-60 font-bold mt-1">
                        HOURS
                      </span>
                    </button>

                    <span className="text-[32px] md:text-[40px] font-black pb-4">:</span>

                    {/* Minutes Block */}
                    <button
                      type="button"
                      onClick={() => {
                        setPickerFocusUnit("minutes");
                        setModalTarget({ type: "timer-edit", id: focusedTimer.id });
                      }}
                      className="group flex flex-col items-center px-3 py-1.5 rounded-[8px] border border-transparent hover:border-[#ffcc00] hover:bg-[#1a1a00] active:scale-95 transition-all cursor-pointer"
                    >
                      <span className="text-[38px] md:text-[46px] font-black tracking-widest leading-none group-hover:drop-shadow-[0_0_14px_rgba(255,204,0,0.8)]">
                        {hms.m}
                      </span>
                      <span className="text-[8px] md:text-[9px] tracking-widest opacity-60 font-bold mt-1">
                        MINUTES
                      </span>
                    </button>

                    <span className="text-[32px] md:text-[40px] font-black pb-4">:</span>

                    {/* Seconds Block */}
                    <button
                      type="button"
                      onClick={() => {
                        setPickerFocusUnit("seconds");
                        setModalTarget({ type: "timer-edit", id: focusedTimer.id });
                      }}
                      className="group flex flex-col items-center px-3 py-1.5 rounded-[8px] border border-transparent hover:border-[#ffcc00] hover:bg-[#1a1a00] active:scale-95 transition-all cursor-pointer"
                    >
                      <span className="text-[38px] md:text-[46px] font-black tracking-widest leading-none group-hover:drop-shadow-[0_0_14px_rgba(255,204,0,0.8)]">
                        {hms.s}
                      </span>
                      <span className="text-[8px] md:text-[9px] tracking-widest opacity-60 font-bold mt-1">
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
                        className="px-3 py-1.5 rounded bg-black border border-[#ffcc00] text-[#ffcc00] text-[11px] font-bold tracking-widest hover:bg-[#1a1a00] cursor-pointer"
                      >
                        STOP
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startTimer(t.id)}
                        className="px-3 py-1.5 rounded bg-[#00c853] text-black text-[11px] font-bold tracking-widest hover:brightness-110 cursor-pointer"
                      >
                        START
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => resetTimer(t.id)}
                      className="px-3 py-1.5 rounded bg-[#ffcc00] text-black text-[11px] font-bold tracking-widest hover:bg-[#ffcc00]/80 cursor-pointer"
                    >
                      RESET
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteTimer(t.id)}
                      className="px-2 py-1.5 rounded bg-red-950 border border-red-500 text-red-400 text-[11px] font-bold hover:bg-red-900 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ================= ALL OPERATIONAL ALARMS QUEUE ================= */}
        <div className="border border-[#ffcc00]/30 rounded-[12px] p-3 bg-black/60 flex flex-col gap-3">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <span className="text-[11px] tracking-[0.25em] font-black text-[#ffcc00]">
              DAILY TACTICAL ALARMS ({alarms.length})
            </span>
            <button
              type="button"
              onClick={() => {
                setPickerFocusUnit("hours");
                setModalTarget({ type: "alarm-new" });
              }}
              className="bg-[#ffcc00] text-black font-black text-[11px] px-3 py-1.5 rounded tracking-widest hover:bg-white transition-colors cursor-pointer"
            >
              + ADD NEW ALARM
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {alarms.map((a) => {
              const hm = formatHM(a.hour, a.minute);
              return (
                <div
                  key={a.id}
                  className="p-2.5 rounded-[8px] border border-[#ffcc00]/25 bg-black flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5"
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setPickerFocusUnit("hours");
                        setModalTarget({ type: "alarm-edit", id: a.id });
                      }}
                      className="flex items-center gap-1 font-black text-[24px] tracking-wider text-[#ffcc00] px-2.5 py-1 rounded bg-[#050500] border border-[#ffcc00]/30 hover:border-[#ffcc00] cursor-pointer"
                    >
                      <span>{hm.h}</span>:<span>{hm.m}</span>
                    </button>
                    <div className="flex flex-col">
                      <span className="text-[12px] font-bold tracking-wider text-white">
                        {a.label}
                      </span>
                      <span className="text-[9px] tracking-widest opacity-60">
                        {a.armed ? "ARMED — BANGKOK DEPLOYMENT TARGET" : "DISARMED"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end md:self-auto">
                    <button
                      type="button"
                      onClick={() => toggleAlarmArmed(a.id)}
                      className={`px-3 py-1.5 rounded text-[11px] font-bold tracking-widest transition-colors cursor-pointer ${
                        a.armed
                          ? "bg-[#00c853] text-black hover:brightness-110"
                          : "bg-black border border-[#ffcc00]/40 text-[#ffcc00]/60 hover:text-[#ffcc00]"
                      }`}
                    >
                      {a.armed ? "ARMED" : "DISARMED"}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteAlarm(a.id)}
                      className="px-2 py-1.5 rounded bg-red-950 border border-red-500 text-red-400 text-[11px] font-bold hover:bg-red-900 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ================= AUDIO SETTINGS & ZERO-SOUND DISPATCH ================= */}
        <div className="border border-[#ffcc00]/30 rounded-[12px] p-3 bg-black flex flex-col gap-3">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <span className="text-[11px] tracking-[0.25em] font-black text-[#ffcc00]">
              TACTICAL AUDIO &amp; ZERO-SOUND DISPATCH
            </span>
            <span className="text-[10px] text-[#ffcc00]/60">
              VOLUME: {Math.round(timerVol * 100)}%
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[10px] tracking-widest opacity-60">MIN</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={timerVol}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setTimerVol(v);
                getAudio().setVolume(v);
              }}
              className="flex-1"
            />
            <span className="text-[10px] tracking-widest opacity-60">MAX</span>
          </div>

          {/* Zero Sound Mode Chips */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 mt-1">
            {(["voice", "boom", "alarm", "ctu_beep", "stinger"] as ZeroSoundType[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setZeroSound(key);
                  showToast(`ZERO SOUND ARMED: ${ZERO_SOUND_LABELS[key]}`, 1500);
                }}
                className={`py-2 px-1 text-center rounded text-[10px] font-bold tracking-wider transition-colors cursor-pointer border ${
                  zeroSound === key
                    ? "bg-[#ffcc00] text-black border-[#ffcc00] shadow-[0_0_10px_rgba(255,204,0,0.5)]"
                    : "bg-[#0a0a00] text-[#ffcc00] border-[#ffcc00]/20 hover:border-[#ffcc00]"
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
                getAudio().stopAll();
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

          {/* Giant Countdown Digit - Shakes violently at <= 3 Seconds */}
          <div className="flex flex-col items-center justify-center my-auto">
            <div className="text-[14px] md:text-[18px] tracking-[0.4em] font-bold text-[#ffcc00]/70 mb-2">
              SECONDS TO ZERO
            </div>
            <div
              className={`font-black leading-none tracking-tight select-none ${
                takeoverRemaining <= 3
                  ? "ctu-shake-intense text-red-500 drop-shadow-[0_0_35px_rgba(255,0,0,0.9)]"
                  : takeoverRemaining <= 5
                    ? "text-orange-400 drop-shadow-[0_0_20px_rgba(255,140,0,0.8)]"
                    : "text-[#ffcc00] glow"
              }`}
              style={{ fontSize: "clamp(120px, 28vw, 240px)", lineHeight: "0.85" }}
            >
              {String(takeoverRemaining).padStart(2, "0")}
            </div>
            <div className="text-[11px] tracking-[0.3em] opacity-80 mt-4 text-[#ffcc00]">
              {takeoverRemaining <= 3
                ? "CRISIS TIER 3: TRIPLE AUDIO ESCALATION & SEISMIC LOCK"
                : takeoverRemaining <= 5
                  ? "CRISIS TIER 2: DOUBLE AUDIO ESCALATION ENGAGED"
                  : "TACTICAL KLAXON ACTIVE"}
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

      {/* ================= FULLSCREEN 24 SEASON OPENING VIDEO MODAL ================= */}
      {activeVideoModal === "opening" && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[10000] bg-black flex flex-col justify-between overflow-hidden select-none border-l-[10px] border-[#ff0000]"
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveVideoModal(null);
          }}
        >
          {/* TOP TACTICAL CONTROL BAR - MATCHING CREDITS */}
          <div className="h-[48px] border-b border-white/10 flex items-center justify-between px-3 md:px-5 bg-black shrink-0 z-20">
            <div className="flex items-center gap-3">
              <div className="text-[10px] md:text-[11px] tracking-[0.35em] text-[#ffcc00] font-black">
                24 // OPENING SEQUENCE // {liveTime}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-2 mr-2 text-[8px] md:text-[9px] tracking-[0.2em] text-[#ffcc00]/70">
                <span className="flex items-center gap-1 text-red-500 font-bold animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-red-600 inline-block shadow-[0_0_8px_red]" />
                  REC
                </span>
                <span>SECURE FEED</span>
                <span className="hidden md:inline">CALIBRATED ASPECT RATIO</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveVideoModal(null)}
                className="min-h-[36px] px-4 border-2 border-[#ffcc00] text-[#ffcc00] bg-black font-black tracking-[0.2em] text-[12px] rounded-[6px] hover:bg-[#ffcc00] hover:text-black transition-colors cursor-pointer"
              >
                ✕ CLOSE [ESC]
              </button>
            </div>
          </div>

          {/* MAIN CINEMATIC THEATER VIEW WITH ARTIFACT CROPPING & CRT SCANLINES */}
          <div className="flex-1 flex items-center justify-center p-3 md:p-8 relative bg-black overflow-hidden">
            <div className="relative w-full max-w-[1020px] aspect-video bg-black rounded-[10px] border-2 border-[#ffcc00]/40 shadow-[0_0_40px_rgba(255,204,0,0.25)] overflow-hidden flex items-center justify-center">
              {/* Cropping wrapper: scale and slight translate crops out the 12px red screen recorder artifact on the left */}
              <div className="w-full h-full relative overflow-hidden bg-black">
                <video
                  src="/24 Opening.mp4"
                  controls
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover scale-[1.07] -translate-x-[2%]"
                />
              </div>

              {/* CRT Scanlines Overlay */}
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.06]"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(0deg, white 0px, white 1px, transparent 1px, transparent 3px)",
                }}
              />
            </div>
          </div>

          {/* FOOTER TELEMETRY BAR */}
          <div className="h-[36px] border-t border-white/10 flex items-center justify-between px-4 bg-black/90 text-[8px] md:text-[9px] tracking-[0.25em] text-[#ffcc00]/60 shrink-0">
            <span>CTU LOS ANGELES // PRIMARY SURVEILLANCE FEED</span>
            <span>KLAXON AUDIO ENGAGED</span>
          </div>
        </div>
      )}

      {/* ================= 24 ENDING CREDITS: 32 WATERCOLOR SPLIT-SCREEN EXPERIENCE ================= */}
      {activeVideoModal === "credits" && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[10000] bg-black flex flex-col justify-between overflow-hidden select-none border-l-[10px] border-[#ff0000]"
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveVideoModal(null);
          }}
        >
          {/* Authentic Sean Callery Ending Theme & Clock Ticks Soundtrack */}
          <audio
            ref={creditsAudioRef}
            src="/24 Closing.mp4"
            autoPlay
            loop={false}
            muted={!creditsMusicOn}
          />

          {/* TOP TACTICAL CONTROL BAR - MATCHING OPENING */}
          <div className="h-[48px] border-b border-white/10 flex items-center justify-between px-3 md:px-5 bg-black shrink-0 z-20">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="text-[10px] md:text-[11px] tracking-[0.35em] text-[#ffcc00] font-black">
                24 // ENDING CREDITS // {liveTime}
              </div>
              <button
                type="button"
                onClick={() => setCreditsMusicOn((prev) => !prev)}
                className="min-h-[32px] px-2.5 md:px-3 border border-[#ffcc00]/40 text-[9px] md:text-[10px] tracking-[0.2em] font-bold rounded bg-black text-[#ffcc00] hover:bg-[#ffcc00] hover:text-black transition-colors cursor-pointer"
              >
                {creditsMusicOn ? "🔊 MUSIC ON • SEAN CALLERY" : "🔇 MUSIC MUTED"}
              </button>
              <button
                type="button"
                onClick={() =>
                  setCreditsDisplayMode((prev) => (prev === "watercolors" ? "original" : "watercolors"))
                }
                className="min-h-[32px] px-2.5 md:px-3 border border-white/20 text-[9px] md:text-[10px] tracking-[0.2em] font-bold rounded bg-black text-white/80 hover:border-[#ffcc00] hover:text-[#ffcc00] transition-colors cursor-pointer hidden sm:inline-block"
              >
                {creditsDisplayMode === "watercolors" ? "🎬 VIEW ORIGINAL VIDEO" : "🎨 32 WATERCOLORS GRID"}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-2 mr-2 text-[8px] md:text-[9px] tracking-[0.2em] text-[#ffcc00]/70">
                <span className="flex items-center gap-1 text-red-500 font-bold animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-red-600 inline-block shadow-[0_0_8px_red]" />
                  REC
                </span>
                <span>SECURE ARCHIVE</span>
                <span className="hidden md:inline">32 WATERCOLORS ROTATING</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveVideoModal(null)}
                className="min-h-[36px] px-4 border-2 border-[#ffcc00] text-[#ffcc00] bg-black font-black tracking-[0.2em] text-[12px] rounded-[6px] hover:bg-[#ffcc00] hover:text-black transition-colors cursor-pointer"
              >
                ✕ CLOSE [ESC]
              </button>
            </div>
          </div>

          {/* DISPLAY MODE 1: ORIGINAL VIDEO WITH CLEAN RECORDER CROP */}
          {creditsDisplayMode === "original" ? (
            <div className="flex-1 flex items-center justify-center p-3 md:p-8 relative bg-black overflow-hidden">
              <div className="relative w-full max-w-[1020px] aspect-video bg-black rounded-[10px] border-2 border-[#ffcc00]/40 shadow-[0_0_40px_rgba(255,204,0,0.25)] overflow-hidden flex items-center justify-center">
                <div className="w-full h-full relative overflow-hidden bg-black">
                  <video
                    src="/24 Closing.mp4"
                    controls
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover scale-[1.07] -translate-x-[2%]"
                  />
                </div>
                <div
                  className="pointer-events-none absolute inset-0 opacity-[0.06]"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(0deg, white 0px, white 1px, transparent 1px, transparent 3px)",
                  }}
                />
              </div>
            </div>
          ) : (
            <>
              {/* DISPLAY MODE 2: TACTICAL SPLIT-SCREEN SURVEILLANCE GRID (ALL 32 WATERCOLORS) */}
              <div className="relative bg-black p-[3px] grid grid-cols-3 grid-rows-2 gap-[3px] h-[58vh] min-h-[300px] max-h-[60vh] shrink-0 border-b border-[#ffcc00]/20">
                {/* Box 1 (Top-Left): CAM 01 - Los Angeles Night Road */}
                <div className="relative border border-white/20 overflow-hidden bg-black">
                  <img
                    src={WATERCOLOR_IMAGES[(creditsStep * 5 + 0) % WATERCOLOR_IMAGES.length]}
                    alt="Los Angeles night road watercolor"
                    className="absolute inset-0 w-full h-full object-cover ken watercolor scale-[1.05]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
                  <div className="absolute top-1 left-1 bg-black/80 border border-[#ffcc00]/30 text-[#ffcc00] text-[8px] tracking-[0.2em] px-1.5 py-0.5 font-bold">
                    LOS ANGELES • {liveTime}
                  </div>
                  <div className="absolute bottom-1 left-1 text-[7px] tracking-[0.3em] text-white/70 font-bold">
                    CAM 01 • NIGHT ROAD
                  </div>
                </div>

                {/* Box 2 (Top-Center): CTU Field Operative */}
                <div className="relative border border-white/20 overflow-hidden bg-black">
                  <img
                    src={WATERCOLOR_IMAGES[(creditsStep * 5 + 1) % WATERCOLOR_IMAGES.length]}
                    alt="CTU Field Operative watercolor"
                    className="absolute inset-0 w-full h-full object-cover ken watercolor"
                    style={{ animationDelay: "1.2s" }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
                  <div className="absolute bottom-1 left-1 text-[7px] tracking-[0.3em] text-white/70 font-bold">
                    CTU • FIELD OP
                  </div>
                  <div className="absolute top-1 right-1 w-2 h-2 bg-red-600 rounded-full animate-pulse shadow-[0_0_6px_red]" />
                </div>

                {/* Box 3 (Top-Right): CTU Analyst Live Feed */}
                <div className="relative border border-white/20 overflow-hidden bg-black">
                  <img
                    src={WATERCOLOR_IMAGES[(creditsStep * 5 + 2) % WATERCOLOR_IMAGES.length]}
                    alt="CTU Analyst watercolor"
                    className="absolute inset-0 w-full h-full object-cover ken watercolor"
                    style={{ animationDelay: "0.6s" }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
                  <div className="absolute bottom-1 left-1 text-[7px] tracking-[0.3em] text-white/70 font-bold">
                    CTU • ANALYST • LIVE
                  </div>
                  <div className="absolute top-1 left-1 bg-[#ffcc00] text-black text-[7px] font-black tracking-[0.2em] px-1">
                    LIVE {liveTime.slice(-5)}
                  </div>
                </div>

                {/* Box 4 (Bottom Left & Center, 2 columns wide): CTU Headquarters Exterior with Inset */}
                <div className="relative border border-white/20 overflow-hidden bg-black col-span-2">
                  <img
                    src={WATERCOLOR_IMAGES[(creditsStep * 5 + 3) % WATERCOLOR_IMAGES.length]}
                    alt="CTU Los Angeles Exterior watercolor"
                    className="absolute inset-0 w-full h-full object-cover ken watercolor scale-[1.08]"
                    style={{ animationDelay: "2s" }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />
                  <div className="absolute top-1 left-1 bg-black/80 border border-white/20 text-white/80 text-[7px] tracking-[0.3em] px-1.5 py-0.5">
                    CTU LOS ANGELES • EXTERIOR • NIGHT
                  </div>
                  <div className="absolute bottom-1 right-1 flex gap-1">
                    <span className="bg-black/80 border border-[#ffcc00]/30 text-[#ffcc00]/70 text-[6px] px-1 py-0.5 font-bold">
                      CAM 04
                    </span>
                    <span className="bg-[#ffcc00] text-black text-[6px] font-bold px-1 py-0.5 tracking-widest">
                      {liveDate.slice(0, 11)}
                    </span>
                  </div>
                  {/* Tactical surveillance inset artwork */}
                  <div className="absolute top-1/2 right-2 -translate-y-1/2 w-[28%] aspect-[4/3] border border-white/40 overflow-hidden bg-black hidden md:block shadow-[0_0_12px_rgba(0,0,0,0.8)]">
                    <img
                      src={WATERCOLOR_IMAGES[(creditsStep * 5 + 4) % WATERCOLOR_IMAGES.length]}
                      alt="Tactical inset watercolor"
                      className="w-full h-full object-cover watercolor opacity-90"
                    />
                  </div>
                </div>

                {/* Box 5 (Bottom-Right): Washington DC CTU Division */}
                <div className="relative border border-white/20 overflow-hidden bg-black">
                  <img
                    src={WATERCOLOR_IMAGES[(creditsStep * 5 + 5) % WATERCOLOR_IMAGES.length]}
                    alt="Washington DC CTU Division watercolor"
                    className="absolute inset-0 w-full h-full object-cover ken watercolor"
                    style={{ animationDelay: "1.8s" }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                  <div className="absolute bottom-1 left-1 text-[7px] tracking-[0.3em] text-white/70 font-bold">
                    WASHINGTON DC • CTU DIVISION
                  </div>
                  <div className="absolute top-1 right-1 bg-black/70 border border-white/20 text-white/60 text-[6px] px-1 font-bold">
                    02:59:42
                  </div>
                </div>

                {/* Tactical Scanlines Pattern */}
                <div
                  className="pointer-events-none absolute inset-0 opacity-[0.06]"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(0deg, white 0px, white 1px, transparent 1px, transparent 3px)",
                  }}
                />
              </div>

              {/* LOWER SECTION: ROLLING AMBER CREDITS */}
              <div className="flex-1 relative overflow-hidden bg-black border-t border-white/10">
                {/* Vignette Gradients */}
                <div className="absolute top-0 left-0 right-0 h-[40px] bg-gradient-to-b from-black to-transparent z-10 pointer-events-none" />
                <div className="absolute bottom-0 left-0 right-0 h-[60px] bg-gradient-to-t from-black to-transparent z-10 pointer-events-none" />

                {/* Rolling Credits Content */}
                <div className="absolute inset-0 flex justify-center overflow-hidden">
                  <div
                    className="w-full max-w-[580px] will-change-transform hover:[animation-play-state:paused]"
                    style={{ animation: "creditsRoll 62s linear forwards" }}
                  >
                    <div
                      className="flex flex-col items-center text-center px-6 pt-[6vh] pb-[22vh]"
                      style={{ lineHeight: "1.8" }}
                    >
                      <div className="text-[#ffcc00] font-black tracking-[0.25em] text-[13px]">
                        THE FOLLOWING TAKES PLACE BETWEEN
                      </div>
                      <div className="mt-2 text-[#ffcc00] font-black tracking-[0.2em] text-[24px] md:text-[30px] glow">
                        {creditsHours.start}
                      </div>
                      <div className="text-[#ffcc00]/60 text-[10px] tracking-[0.5em]">AND</div>
                      <div className="text-[#ffcc00] font-black tracking-[0.2em] text-[24px] md:text-[30px] glow">
                        {creditsHours.end}
                      </div>

                      <div className="mt-5 w-[100px] h-[2px] bg-[#ffcc00]/60" />

                      <div className="mt-8 text-white font-bold tracking-[0.35em] text-[15px] glow">
                        KIEFER SUTHERLAND
                      </div>

                      <div className="mt-8 text-white/60 tracking-[0.25em] text-[10px]">CREATED BY</div>
                      <div className="mt-1 text-white font-bold tracking-[0.25em] text-[13px]">
                        ROBERT COCHRAN &amp; JOEL SURNOW
                      </div>

                      <div className="mt-7 text-white/60 tracking-[0.25em] text-[10px]">ORIGINAL MUSIC BY</div>
                      <div className="mt-1 text-[#ffcc00] font-black tracking-[0.3em] text-[14px]">
                        SEAN CALLERY
                      </div>

                      <div className="mt-7 text-white/60 tracking-[0.25em] text-[10px]">STARRING</div>
                      <div className="mt-1 text-white/90 font-bold tracking-[0.2em] text-[12px] space-y-1">
                        <div>LESLIE HOPE</div>
                        <div>SARAH CLARKE</div>
                        <div>ELISHA CUTHBERT</div>
                        <div>DENNIS HAYSBERT</div>
                        <div>CARLOS BERNARD</div>
                        <div>PENNY JOHNSON JERALD</div>
                      </div>

                      <div className="mt-7 text-white/60 tracking-[0.25em] text-[10px]">CO-EXECUTIVE PRODUCERS</div>
                      <div className="mt-1 text-white/80 font-bold tracking-[0.2em] text-[11px] space-y-1">
                        <div>MICHAEL LOEFFELHOLZ</div>
                        <div>STEPHEN KRONISH</div>
                      </div>

                      <div className="mt-7 text-white/60 tracking-[0.25em] text-[10px]">EXECUTIVE PRODUCERS</div>
                      <div className="mt-1 text-white font-bold tracking-[0.2em] text-[12px] space-y-1">
                        <div>BRIAN GRAZER</div>
                        <div>TONY KRANTZ</div>
                        <div>HOWARD GORDON</div>
                        <div>ROBERT COCHRAN</div>
                        <div>JOEL SURNOW</div>
                      </div>

                      <div className="mt-7 text-white/60 tracking-[0.25em] text-[10px]">DIRECTED BY</div>
                      <div className="mt-1 text-white font-bold tracking-[0.25em] text-[13px]">
                        STEPHEN HOPKINS
                      </div>

                      <div className="mt-8 text-white/40 text-[10px] tracking-[0.4em]">ASSOCIATE PRODUCER</div>
                      <div className="text-white text-[12px] tracking-[0.2em] mt-1">JAMES LAPIDUS</div>

                      <div className="mt-6 text-white/40 text-[10px] tracking-[0.4em]">EDITED BY</div>
                      <div className="text-white text-[12px] tracking-[0.2em] mt-1">SCOTT POWELL</div>

                      <div className="mt-6 text-white/40 text-[10px] tracking-[0.4em]">PRODUCTION DESIGNER</div>
                      <div className="text-white text-[12px] tracking-[0.2em] mt-1">CARLOS BARBOSA</div>

                      <div className="mt-6 text-white/40 text-[10px] tracking-[0.4em]">DIRECTOR OF PHOTOGRAPHY</div>
                      <div className="text-white text-[12px] tracking-[0.2em] mt-1">RODNEY CHARTERS</div>

                      {/* Archive Watercolors Attribution */}
                      <div className="pt-8 border-t border-[#ffcc00]/20 w-full mt-8">
                        <div className="text-[#ffcc00] text-[11px] tracking-[0.5em] font-black">
                          WATERCOLOR SPLIT-SCREEN • 32 CTU ARCHIVE ARTWORKS
                        </div>
                        <div className="mt-1 text-white/40 text-[9px] tracking-[0.2em]">
                          LOS ANGELES NIGHT • CTU OPERATIVE • ANALYST • CTU HQ • DC DIVISION
                        </div>
                      </div>

                      {/* Iconic End of Hour Clock Climax */}
                      <div className="pt-8">
                        <div className="inline-flex flex-col items-center gap-3 border border-[#ffcc00]/30 bg-black px-8 py-5 rounded-[12px] shadow-[0_0_24px_rgba(255,204,0,0.2)]">
                          <div className="text-white/50 text-[9px] tracking-[0.5em] font-bold">END OF HOUR</div>
                          <div className="text-[38px] md:text-[48px] font-black tracking-[0.18em] leading-none text-[#ffcc00] glow">
                            {creditsHours.endOfHour}
                          </div>
                          <div className="text-[9px] tracking-[0.35em] text-red-500 font-bold animate-pulse">
                            ● EVENTS OCCUR IN REAL TIME
                          </div>
                        </div>
                      </div>

                      <div className="mt-12 text-[#ffcc00] font-black tracking-[0.35em] text-[18px] glow">
                        CTU // LOS ANGELES
                      </div>
                      <div className="text-[#ffcc00]/50 tracking-[0.3em] text-[9px] mt-1">
                        COUNTER TERRORIST UNIT • ALL RIGHTS RESERVED
                      </div>
                      <div className="mt-6 text-[#ffcc00]/40 tracking-[0.2em] text-[8px]">
                        20TH CENTURY FOX TELEVISION • IMAGINE TELEVISION
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* FOOTER TELEMETRY BAR - MATCHING OPENING */}
          <div className="h-[36px] border-t border-white/10 flex items-center justify-between px-4 bg-black/90 text-[8px] md:text-[9px] tracking-[0.25em] text-[#ffcc00]/60 shrink-0">
            <span>CTU ARCHIVE DIVISION // REEL 24-001</span>
            <span>END OF EPISODE CLOCK LOCKED</span>
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
