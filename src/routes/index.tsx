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
      { name: "description", content: "Authentic 24 TV Show CTU Tactical Mission Timer & Surveillance System." },
      { property: "og:title", content: "CTU Tactical Operational Command" },
      { property: "og:description", content: "Authentic 24 TV Show CTU Mission Terminal." },
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

export function CTUTerminalV74() {
  // Live clock
  const [now, setNow] = useState<Date>(() => new Date());

  // Timer state
  const [timerDuration, setTimerDuration] = useState<number>(300);
  const [timerRemaining, setTimerRemaining] = useState<number>(300);
  const [timerRunning, setTimerRunning] = useState<boolean>(false);
  const [timerTimesUp, setTimerTimesUp] = useState<boolean>(false);
  const [timerStatus, setTimerStatus] = useState<string>("READY - CLICK NUMBERS TO SET");
  const [timerVol, setTimerVol] = useState<number>(0.85);

  // Alarm state
  const [alarmHour, setAlarmHour] = useState<number>(19);
  const [alarmMinute, setAlarmMinute] = useState<number>(38);
  const [alarmArmed, setAlarmArmed] = useState<boolean>(true);
  const alarmTriggeredRef = useRef<boolean>(false);

  // Zero sound preference
  const [zeroSound, setZeroSound] = useState<ZeroSoundType>("voice");

  // Samsung Time Picker Modal
  const [modalMode, setModalMode] = useState<"timer" | "alarm" | null>(null);
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

  // Audio engine
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

  // Update live clock every 250ms
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

  // Audio synth zero sounds
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

  // Start 10s Takeover
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

  // Timer Tick Interval
  useEffect(() => {
    if (timerRunning) {
      timerIntervalRef.current = setInterval(() => {
        setTimerRemaining((prev) => {
          if (prev <= 1) {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
            setTimerRunning(false);
            setTimerTimesUp(true);
            setTimerStatus("TIME'S UP");
            triggerZeroSound();
            showToast("TIME'S UP - OPERATION CONCLUDED", 4000);
            return 0;
          }

          if (prev === 11) {
            startTakeover(10, "TIMER EXPIRATION", () => {
              setTimerRemaining(0);
              setTimerRunning(false);
              setTimerTimesUp(true);
              setTimerStatus("TIME'S UP");
            });
          }

          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [timerRunning, startTakeover, triggerZeroSound, showToast]);

  // Check Alarm Match
  useEffect(() => {
    if (!alarmArmed) return;
    const curH = bangkokDate.getHours();
    const curM = bangkokDate.getMinutes();
    const curS = bangkokDate.getSeconds();

    if (curH === alarmHour && curM === alarmMinute && curS === 0 && !alarmTriggeredRef.current) {
      alarmTriggeredRef.current = true;
      startTakeover(10, `ALARM TARGET ${String(alarmHour).padStart(2, "0")}:${String(alarmMinute).padStart(2, "0")}`, () => {
        showToast("ALARM TRIGGERED", 4000);
      });
    }

    if (curM !== alarmMinute) {
      alarmTriggeredRef.current = false;
    }
  }, [bangkokDate, alarmArmed, alarmHour, alarmMinute, startTakeover, showToast]);

  // Format helpers
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

  const timerHms = useMemo(() => formatHMS(timerRemaining), [timerRemaining]);
  const alarmHm = useMemo(() => formatHM(alarmHour, alarmMinute), [alarmHour, alarmMinute]);

  // Controls
  const startTimer = () => {
    if (timerRemaining <= 0) {
      showToast("SET A VALID TIME FIRST", 2000);
      return;
    }
    setTimerRunning(true);
    setTimerTimesUp(false);
    setTimerStatus("RUNNING - TACTICAL ENGAGED");
    getAudio().unlockAudio();
    showToast("OPERATION TIMER STARTED", 2000);
  };

  const stopTimer = () => {
    setTimerRunning(false);
    setTimerStatus("PAUSED");
    const audio = getAudio();
    audio.stopCountdownAlert();
    audio.stopZeroTheme();
    showToast("TIMER PAUSED", 1500);
  };

  const resetTimer = () => {
    setTimerRunning(false);
    setTimerTimesUp(false);
    setTimerRemaining(timerDuration);
    setTimerStatus("READY - CLICK NUMBERS TO SET");
    const audio = getAudio();
    audio.stopCountdownAlert();
    audio.stopZeroTheme();
    showToast("TIMER RESET TO DURATION", 1500);
  };

  const armAlarm = () => {
    setAlarmArmed(true);
    getAudio().unlockAudio();
    showToast(`ALARM ARMED: ${alarmHm.text}`, 2000);
  };

  const disarmAlarm = () => {
    setAlarmArmed(false);
    showToast("ALARM DISARMED", 1500);
  };

  const timerProgress = useMemo(() => {
    if (timerDuration <= 0) return 0;
    const elapsed = timerDuration - timerRemaining;
    return Math.min(100, Math.max(0, (elapsed / timerDuration) * 100));
  }, [timerDuration, timerRemaining]);

  // Handle Modal Save
  const handleModalSave = useCallback(
    (values: SamsungTimePickerValues) => {
      if (modalMode === "timer") {
        const total = values.totalSeconds;
        if (total <= 0) {
          showToast("SET A VALID DURATION", 2000);
          return;
        }
        setTimerDuration(total);
        setTimerRemaining(total);
        setTimerRunning(false);
        setTimerTimesUp(false);
        setTimerStatus("READY - CLICK NUMBERS TO SET");
        showToast(`TIMER SET: ${formatHMS(total).text}`, 2000);
      } else if (modalMode === "alarm") {
        setAlarmHour(values.hours);
        setAlarmMinute(values.minutes);
        showToast(`ALARM SET: ${formatHM(values.hours, values.minutes).text}`, 2000);
      }
      setModalMode(null);
    },
    [modalMode, showToast]
  );

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

        {/* TIMER PANEL (Segmented Clickable Numbers) */}
        <div className="relative border-2 border-dashed border-[#ffcc00] rounded-[14px] p-3 md:p-4 bg-[#050500] min-h-[90px] flex flex-col gap-0">
          <div className="flex justify-between items-center">
            <span className="text-[10px] tracking-[0.25em] opacity-60">
              OPERATION TIMER — CLICK EACH UNIT TO SET
            </span>
            <span
              className={`text-[10px] px-2 py-[2px] rounded border ${
                timerRunning
                  ? "border-green-400 text-green-400"
                  : timerTimesUp
                    ? "border-[#ffcc00] text-[#ffcc00]"
                    : "border-[#ffcc00]/40 text-[#ffcc00]/60"
              }`}
            >
              {timerRunning ? "RUNNING" : timerTimesUp ? "TIME'S UP" : "IDLE"}
            </span>
          </div>

          {/* Segmented Clickable Time Readout (Hours, Minutes, Seconds) */}
          <div className="mt-3 py-3 px-2 border border-[#ffcc00]/30 rounded-[10px] bg-black flex flex-col items-center">
            <div className="flex items-center justify-center gap-1.5 md:gap-3 flex-wrap">
              {/* Hours Block */}
              <button
                type="button"
                onClick={() => {
                  setPickerFocusUnit("hours");
                  setModalMode("timer");
                }}
                className="group flex flex-col items-center px-3 py-1.5 rounded-[8px] border border-transparent hover:border-[#ffcc00] hover:bg-[#1a1a00] active:scale-95 transition-all cursor-pointer"
              >
                <span className="text-[38px] md:text-[46px] font-black tracking-widest leading-none text-[#ffcc00] group-hover:drop-shadow-[0_0_14px_rgba(255,204,0,0.8)]">
                  {timerHms.h}
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
                  setModalMode("timer");
                }}
                className="group flex flex-col items-center px-3 py-1.5 rounded-[8px] border border-transparent hover:border-[#ffcc00] hover:bg-[#1a1a00] active:scale-95 transition-all cursor-pointer"
              >
                <span className="text-[38px] md:text-[46px] font-black tracking-widest leading-none text-[#ffcc00] group-hover:drop-shadow-[0_0_14px_rgba(255,204,0,0.8)]">
                  {timerHms.m}
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
                  setModalMode("timer");
                }}
                className="group flex flex-col items-center px-3 py-1.5 rounded-[8px] border border-transparent hover:border-[#ffcc00] hover:bg-[#1a1a00] active:scale-95 transition-all cursor-pointer"
              >
                <span className="text-[38px] md:text-[46px] font-black tracking-widest leading-none text-[#ffcc00] group-hover:drop-shadow-[0_0_14px_rgba(255,204,0,0.8)]">
                  {timerHms.s}
                </span>
                <span className="text-[8px] md:text-[9px] tracking-widest text-[#ffcc00]/60 font-bold mt-1">
                  SECONDS
                </span>
              </button>
            </div>
            <div className="text-[10px] opacity-60 mt-1 tracking-widest">
              TAP HOURS, MINUTES, OR SECONDS TO CHANGE
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-3 h-[6px] w-full bg-[#1a1a00] rounded overflow-hidden border border-[#ffcc00]/20">
            <div
              className="h-full bg-[#ffcc00] transition-all duration-500"
              style={{ width: `${timerProgress}%` }}
            />
          </div>

          {/* Status Line */}
          <div className="mt-2 text-[11px] tracking-wide opacity-70 min-h-[18px] w-full text-left">
            {timerStatus}
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-3 gap-2 mt-3 w-full">
            <button
              type="button"
              onClick={startTimer}
              className="bg-[#00c853] text-black font-bold min-h-[44px] rounded-[6px] text-[13px] tracking-widest hover:brightness-110 active:scale-[0.98] whitespace-nowrap overflow-hidden cursor-pointer"
            >
              START
            </button>
            <button
              type="button"
              onClick={stopTimer}
              className="bg-black border border-[#ffcc00] text-[#ffcc00] font-bold min-h-[44px] rounded-[6px] text-[13px] tracking-widest hover:bg-[#1a1a00] active:scale-[0.98] whitespace-nowrap overflow-hidden cursor-pointer"
            >
              STOP
            </button>
            <button
              type="button"
              onClick={resetTimer}
              className="bg-[#ffcc00] text-black font-bold min-h-[44px] rounded-[6px] text-[13px] tracking-widest hover:bg-[#ffcc00]/80 active:scale-[0.98] whitespace-nowrap overflow-hidden cursor-pointer"
            >
              RESET
            </button>
          </div>

          {/* Quick Countdown Trigger */}
          <div className="grid grid-cols-1 gap-2 mt-3">
            <button
              type="button"
              onClick={() => {
                startTakeover(10, "TIMER / ALARM", () => {
                  setTimerRemaining(0);
                  setTimerRunning(false);
                  setTimerTimesUp(true);
                  setTimerStatus("TIME'S UP");
                  showToast("TIME'S UP", 3000);
                });
              }}
              className="min-h-[44px] rounded-[6px] font-bold text-[11px] md:text-[12px] tracking-widest bg-[#ffcc00] text-black border-2 border-[#ffcc00] hover:bg-black hover:text-[#ffcc00] px-2 whitespace-normal leading-tight cursor-pointer"
            >
              TIMER / ALARM — COUNTDOWN 10→0→{ZERO_SOUND_LABELS[zeroSound]}
            </button>
          </div>

          {/* Volume T */}
          <div className="mt-3 flex items-center gap-3">
            <span className="text-[10px] w-[40px] opacity-60">VOL T</span>
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

          {/* At Zero Play Selector */}
          <div className="mt-4 border border-[#ffcc00]/30 rounded-[8px] p-2.5 bg-black/60">
            <div className="text-[9px] tracking-[0.28em] opacity-60 mb-2">AT ZERO PLAY:</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
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
        </div>

        {/* ALARM PANEL (Segmented Clickable Numbers) */}
        <div className="relative border-2 border-dashed border-[#ffcc00] rounded-[14px] p-3 md:p-4 bg-[#050500] min-h-[90px] flex flex-col gap-0">
          <div className="flex justify-between items-center">
            <span className="text-[10px] tracking-[0.25em] opacity-60">
              DAILY ALARM — CLICK EACH UNIT TO SET
            </span>
            <span
              className={`text-[10px] px-2 py-[2px] rounded border ${
                alarmArmed ? "border-green-400 text-green-400" : "border-[#ffcc00]/40 text-[#ffcc00]/60"
              }`}
            >
              {alarmArmed ? "ARMED" : "OFF"}
            </span>
          </div>

          {/* Segmented Clickable Alarm Readout */}
          <div className="mt-3 py-3 px-2 border border-[#ffcc00]/30 rounded-[10px] bg-black flex flex-col items-center">
            <div className="flex items-center justify-center gap-2 md:gap-3 flex-wrap">
              {/* Hours Block */}
              <button
                type="button"
                onClick={() => {
                  setPickerFocusUnit("hours");
                  setModalMode("alarm");
                }}
                className="group flex flex-col items-center px-3 py-1.5 rounded-[8px] border border-transparent hover:border-[#ffcc00] hover:bg-[#1a1a00] active:scale-95 transition-all cursor-pointer"
              >
                <span className="text-[38px] md:text-[46px] font-black tracking-widest leading-none text-[#ffcc00] group-hover:drop-shadow-[0_0_14px_rgba(255,204,0,0.8)]">
                  {alarmHm.h}
                </span>
                <span className="text-[8px] md:text-[9px] tracking-widest text-[#ffcc00]/60 font-bold mt-1">
                  HOURS (24HR)
                </span>
              </button>

              <span className="text-[32px] md:text-[40px] font-black text-[#ffcc00] pb-4">:</span>

              {/* Minutes Block */}
              <button
                type="button"
                onClick={() => {
                  setPickerFocusUnit("minutes");
                  setModalMode("alarm");
                }}
                className="group flex flex-col items-center px-3 py-1.5 rounded-[8px] border border-transparent hover:border-[#ffcc00] hover:bg-[#1a1a00] active:scale-95 transition-all cursor-pointer"
              >
                <span className="text-[38px] md:text-[46px] font-black tracking-widest leading-none text-[#ffcc00] group-hover:drop-shadow-[0_0_14px_rgba(255,204,0,0.8)]">
                  {alarmHm.m}
                </span>
                <span className="text-[8px] md:text-[9px] tracking-widest text-[#ffcc00]/60 font-bold mt-1">
                  MINUTES
                </span>
              </button>

              <div className="ml-3 flex flex-col items-center justify-center pl-3 border-l border-[#ffcc00]/30">
                <span
                  className={`text-[12px] font-black tracking-widest px-2 py-1 rounded border ${
                    alarmArmed ? "border-green-400 text-green-400" : "border-[#ffcc00]/40 text-[#ffcc00]/60"
                  }`}
                >
                  {alarmArmed ? "ARMED" : "OFF"}
                </span>
              </div>
            </div>
            <div className="text-[10px] opacity-60 mt-1 tracking-widest">
              TAP HOURS OR MINUTES TO CHANGE ALARM
            </div>
          </div>

          {/* Alarm Action Buttons */}
          <div className="grid grid-cols-3 gap-2 mt-3 w-full">
            <button
              type="button"
              onClick={armAlarm}
              className="bg-[#00c853] text-black font-bold min-h-[44px] rounded-[6px] text-[12px] tracking-widest hover:brightness-110 whitespace-nowrap overflow-hidden cursor-pointer"
            >
              ARM 24HR
            </button>
            <button
              type="button"
              onClick={disarmAlarm}
              className="bg-black border border-[#ffcc00] text-[#ffcc00] font-bold min-h-[44px] rounded-[6px] text-[12px] tracking-widest hover:bg-[#1a1a00] whitespace-nowrap overflow-hidden cursor-pointer"
            >
              DISARM
            </button>
            <button
              type="button"
              onClick={() => {
                const audio = getAudio();
                audio.stopZeroTheme();
                disarmAlarm();
                showToast("ALARM STOPPED", 2000);
              }}
              className="bg-[#ff1744] text-white font-bold min-h-[44px] rounded-[6px] text-[12px] tracking-widest hover:brightness-110 whitespace-nowrap overflow-hidden cursor-pointer"
            >
              STOP
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
      {modalMode && (
        <div className="fixed inset-0 z-[10000] bg-black/75 backdrop-blur-[3px] flex items-center justify-center p-3">
          <SamsungTimePicker
            mode={modalMode}
            initialHours={modalMode === "timer" ? Math.floor(timerDuration / 3600) : alarmHour}
            initialMinutes={modalMode === "timer" ? Math.floor((timerDuration % 3600) / 60) : alarmMinute}
            initialSeconds={modalMode === "timer" ? timerDuration % 60 : 0}
            initialFocus={pickerFocusUnit}
            onSave={handleModalSave}
            onCancel={() => setModalMode(null)}
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
