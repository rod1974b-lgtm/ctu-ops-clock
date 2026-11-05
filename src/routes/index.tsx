// src/routes/index.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SamsungTimePicker, type SamsungTimePickerValues } from "@/components/samsung-time-picker";
import { CTUAudio } from "@/lib/ctu-audio";

export const Route = createFileRoute("/")({
  component: CTUTerminalV74,
  head: () => ({
    meta: [
      { title: "CTU OPERATIONAL TERMINAL • 24" },
      {
        name: "description",
        content: "Counter Terrorist Unit tactical mission timer and 24-hour operations terminal.",
      },
    ],
  }),
});

type ZeroSoundType = "voice" | "boom" | "alarm" | "ctu_beep" | "stinger";

const ZERO_SOUND_LABELS: Record<ZeroSoundType, string> = {
  voice: "24 VOICE - 6AM-7AM LOOP",
  boom: "BOOM",
  alarm: "ALARM",
  ctu_beep: "CTU BEEP",
  stinger: "STINGER",
};

function formatHMS(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatHM(hours: number, minutes: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}`;
}

export function CTUTerminalV74() {
  // Audio Engine instance
  const audioRef = useRef<CTUAudio | null>(null);

  // Live Local Clock State
  const [liveTime, setLiveTime] = useState<string>("00:00:00");
  const [liveDay, setLiveDay] = useState<string>("THURSDAY");
  const [liveDate, setLiveDate] = useState<string>("05 NOV 2026 - 24HR MIDNIGHT ROLLOVER OK");

  // Timer State
  const [timerDuration, setTimerDuration] = useState<number>(300); // 5 mins default
  const [timerRemaining, setTimerRemaining] = useState<number>(300);
  const [timerRunning, setTimerRunning] = useState<boolean>(false);
  const [timerTimesUp, setTimerTimesUp] = useState<boolean>(false);
  const [timerStatus, setTimerStatus] = useState<string>("READY");
  const [timerVol, setTimerVol] = useState<number>(0.75);

  // Alarm State
  const [alarmHour, setAlarmHour] = useState<number>(7);
  const [alarmMinute, setAlarmMinute] = useState<number>(0);
  const [alarmArmed, setAlarmArmed] = useState<boolean>(false);
  const [alarmStatus, setAlarmStatus] = useState<string>("ALARM OFF");
  const [alarmVol, setAlarmVol] = useState<number>(0.9);

  // Selected Zero Alert
  const [zeroSound, setZeroSound] = useState<ZeroSoundType>("voice");

  // Fullscreen 10-Second Takeover Overlay
  const [takeoverActive, setTakeoverActive] = useState<boolean>(false);
  const [takeoverCount, setTakeoverCount] = useState<number>(10);
  const [takeoverTitle, setTakeoverTitle] = useState<string>("TIMER / ALARM");
  const [isTakeoverCrisis, setIsTakeoverCrisis] = useState<boolean>(false);
  const takeoverTimerRef = useRef<number | null>(null);
  const takeoverInitialCountRef = useRef<number>(10);
  const takeoverOnCompleteRef = useRef<(() => void) | null>(null);

  // Video Feeds (24 Opening & Ending Credits)
  const [activeVideoModal, setActiveVideoModal] = useState<"opening" | "credits" | null>(null);

  // Drum Picker Modal State
  const [modalMode, setModalMode] = useState<"timer" | "alarm" | null>(null);

  // Toast / Quote Banner
  const [toastMessage, setToastMessage] = useState<string>("");
  const toastTimeoutRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string, durationMs = 2500) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage("");
    }, durationMs);
  }, []);

  // Initialize and ensure audio
  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new CTUAudio();
    }
    audioRef.current.unlock();
    return audioRef.current;
  }, []);

  // Live Local Clock Ticker
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      setLiveTime(`${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`);

      const days = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
      setLiveDay(days[now.getDay()] ?? "THURSDAY");

      const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
      const d = pad(now.getDate());
      const m = months[now.getMonth()];
      const y = now.getFullYear();
      setLiveDate(`${d} ${m} ${y} - 24HR MIDNIGHT ROLLOVER OK`);
    };

    updateClock();
    const interval = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(interval);
  }, []);

  // Trigger sound only at zero climax
  const triggerZeroSound = useCallback(() => {
    const audio = getAudio();
    audio.playZeroTheme();
  }, [getAudio]);

  // Cancel Countdown Takeover
  const cancelTakeover = useCallback(() => {
    if (takeoverTimerRef.current) {
      window.clearInterval(takeoverTimerRef.current);
      takeoverTimerRef.current = null;
    }
    const audio = getAudio();
    audio.stopZeroTheme();
    setTakeoverActive(false);
    setTimerStatus("READY");
    showToast("COUNTDOWN CANCELLED", 2000);
  }, [getAudio, showToast]);

  // Start 10-Second Takeover
  const startTakeover = useCallback(
    (count: number, title: string, onComplete?: () => void) => {
      const audio = getAudio();
      audio.setVolume(timerVol);

      if (takeoverTimerRef.current) {
        window.clearInterval(takeoverTimerRef.current);
        takeoverTimerRef.current = null;
      }

      setTimerRunning(false);
      setTimerStatus(`PAUSED • ${formatHMS(timerRemaining)}`);

      takeoverInitialCountRef.current = count;
      takeoverOnCompleteRef.current = onComplete ?? null;
      setTakeoverCount(count);
      setTakeoverTitle(title);
      setIsTakeoverCrisis(count <= 3);
      setTakeoverActive(true);

      // Play tick only during countdown
      audio.tick(count <= 3 ? 3 : 2);

      let current = count;
      takeoverTimerRef.current = window.setInterval(() => {
        current -= 1;
        if (current < 0) {
          if (takeoverTimerRef.current) {
            window.clearInterval(takeoverTimerRef.current);
            takeoverTimerRef.current = null;
          }
          setTakeoverActive(false);
          triggerZeroSound();
          if (takeoverOnCompleteRef.current) {
            takeoverOnCompleteRef.current();
          }
          return;
        }

        setTakeoverCount(current);
        setIsTakeoverCrisis(current <= 3);
        audio.tick(current <= 3 ? 3 : 2);
      }, 1000);
    },
    [getAudio, timerRemaining, timerVol, triggerZeroSound]
  );

  // Main Timer Interval
  const timerIntervalRef = useRef<number | null>(null);

  const startTimer = useCallback(() => {
    getAudio();

    if (timerRemaining <= 0) {
      showToast("SET TIME FIRST", 2000);
      return;
    }

    if (timerRemaining <= 10) {
      startTakeover(timerRemaining, "TIMER / ALARM", () => {
        setTimerRemaining(0);
        setTimerRunning(false);
        setTimerTimesUp(true);
        setTimerStatus("TIME'S UP");
        showToast("TIME'S UP", 4000);
      });
      return;
    }

    setTimerRunning(true);
    setTimerTimesUp(false);
    setTimerStatus(`RUNNING • ${formatHMS(timerRemaining)}`);
  }, [getAudio, timerRemaining, startTakeover, showToast]);

  const stopTimer = useCallback(() => {
    setTimerRunning(false);
    setTimerStatus(`PAUSED • ${formatHMS(timerRemaining)}`);
    showToast(`PAUSED • ${formatHMS(timerRemaining)}`, 2000);
  }, [timerRemaining, showToast]);

  const resetTimer = useCallback(() => {
    setTimerRunning(false);
    setTimerRemaining(timerDuration);
    setTimerTimesUp(false);
    setTimerStatus("READY");
    const audio = getAudio();
    audio.stopZeroTheme();
  }, [getAudio, timerDuration]);

  // Timer Countdown Heartbeat
  useEffect(() => {
    if (!timerRunning) {
      if (timerIntervalRef.current) {
        window.clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      return;
    }

    timerIntervalRef.current = window.setInterval(() => {
      setTimerRemaining((prev) => {
        const next = prev - 1;

        // At 10 seconds: trigger tactical takeover sequence with audio
        if (next === 10) {
          if (timerIntervalRef.current) {
            window.clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
          }
          window.setTimeout(() => {
            startTakeover(10, "TIMER / ALARM", () => {
              setTimerRemaining(0);
              setTimerRunning(false);
              setTimerTimesUp(true);
              setTimerStatus("TIME'S UP");
              showToast("TIME'S UP", 4000);
            });
          }, 50);
          return 10;
        }

        if (next <= 0) {
          if (timerIntervalRef.current) {
            window.clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
          }
          setTimerRunning(false);
          setTimerTimesUp(true);
          setTimerStatus("TIME'S UP");
          triggerZeroSound();
          showToast("TIME'S UP", 4000);
          return 0;
        }

        setTimerStatus(`RUNNING • ${formatHMS(next)}`);
        return next;
      });
    }, 1000);

    return () => {
      if (timerIntervalRef.current) {
        window.clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [timerRunning, startTakeover, triggerZeroSound, showToast]);

  // Alarm Arming & Check Heartbeat
  const armAlarm = useCallback(() => {
    getAudio();
    setAlarmArmed(true);
    const targetStr = formatHM(alarmHour, alarmMinute);
    setAlarmStatus(`ARMED FOR ${targetStr}`);
    showToast(`ALARM ARMED FOR ${targetStr}`, 2500);
  }, [getAudio, alarmHour, alarmMinute, showToast]);

  const disarmAlarm = useCallback(() => {
    setAlarmArmed(false);
    setAlarmStatus("ALARM OFF");
    const audio = getAudio();
    audio.stopZeroTheme();
    showToast("ALARM DISARMED", 2000);
  }, [getAudio, showToast]);

  useEffect(() => {
    if (!alarmArmed) return;

    const checkAlarm = () => {
      const now = new Date();
      if (now.getHours() === alarmHour && now.getMinutes() === alarmMinute && now.getSeconds() === 0) {
        setAlarmArmed(false);
        setAlarmStatus("ALARM TRIGGERED");
        startTakeover(10, "ALARM IMMINENT", () => {
          showToast("ALARM RINGING", 5000);
        });
      }
    };

    const interval = window.setInterval(checkAlarm, 1000);
    return () => window.clearInterval(interval);
  }, [alarmArmed, alarmHour, alarmMinute, startTakeover, showToast]);

  // Progress Bar Percentage
  const timerProgress = useMemo(() => {
    if (timerDuration <= 0) return 0;
    const elapsed = timerDuration - timerRemaining;
    return Math.min(100, Math.max(0, (elapsed / timerDuration) * 100));
  }, [timerDuration, timerRemaining]);

  // Handle Drum Modal Save
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
        setTimerStatus("READY");
        showToast(`TIMER SET: ${formatHMS(total)}`, 2000);
      } else if (modalMode === "alarm") {
        setAlarmHour(values.hours);
        setAlarmMinute(values.minutes);
        showToast(`ALARM SET: ${formatHM(values.hours, values.minutes)}`, 2000);
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
        {/* DUAL CINEMATIC BUTTONS: 24 OPENING & ENDING CREDITS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveVideoModal("opening")}
            className="w-full bg-[#ffcc00] text-black font-black tracking-[0.14em] text-[17px] md:text-[18px] rounded-[8px] border-2 border-[#ffcc00] hover:bg-black hover:text-[#ffcc00] transition-colors min-h-[44px] py-3 shadow-[0_0_18px_rgba(255,204,0,0.35)]"
          >
            START 24 OPENING
          </button>
          <button
            type="button"
            onClick={() => setActiveVideoModal("credits")}
            className="w-full bg-black text-[#ffcc00] font-black tracking-[0.14em] text-[17px] md:text-[18px] rounded-[8px] border-2 border-[#ffcc00] hover:bg-[#ffcc00] hover:text-black transition-colors min-h-[44px] py-3 shadow-[0_0_14px_rgba(255,204,0,0.25)]"
          >
            ENDING CREDITS
          </button>
        </div>

        {/* TIMER PANEL (V74 DASHED CARD) */}
        <div className="relative border-2 border-dashed border-[#ffcc00] rounded-[14px] p-3 md:p-4 bg-[#050500] min-h-[90px] flex flex-col gap-0">
          <div className="flex justify-between items-center">
            <span className="text-[10px] tracking-[0.25em] opacity-60">TIMER - CLICK TO SET</span>
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

          {/* Centered Clickable Time Readout */}
          <div
            onClick={() => setModalMode("timer")}
            className="mt-3 cursor-pointer select-none text-center py-3 border border-[#ffcc00]/30 rounded-[10px] bg-black hover:bg-[#111100] transition-colors"
          >
            <div className="text-[40px] md:text-[44px] font-black tracking-widest leading-none text-[#ffcc00]">
              {formatHMS(timerRemaining)}
            </div>
            <div className="text-[10px] opacity-50 mt-1 tracking-widest">TAP TO EDIT - HH:MM:SS</div>
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
              className="bg-[#00c853] text-black font-bold min-h-[44px] rounded-[6px] text-[13px] tracking-widest hover:brightness-110 active:scale-[0.98] whitespace-nowrap overflow-hidden"
            >
              START
            </button>
            <button
              type="button"
              onClick={stopTimer}
              className="bg-black border border-[#ffcc00] text-[#ffcc00] font-bold min-h-[44px] rounded-[6px] text-[13px] tracking-widest hover:bg-[#1a1a00] active:scale-[0.98] whitespace-nowrap overflow-hidden"
            >
              STOP
            </button>
            <button
              type="button"
              onClick={resetTimer}
              className="bg-[#ffcc00] text-black font-bold min-h-[44px] rounded-[6px] text-[13px] tracking-widest hover:bg-[#ffcc00]/80 active:scale-[0.98] whitespace-nowrap overflow-hidden"
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
              className="min-h-[44px] rounded-[6px] font-bold text-[11px] md:text-[12px] tracking-widest bg-[#ffcc00] text-black border-2 border-[#ffcc00] hover:bg-black hover:text-[#ffcc00] px-2 whitespace-normal leading-tight"
            >
              TIMER / ALARM - COUNTDOWN 10→0→{ZERO_SOUND_LABELS[zeroSound]}
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
              className="flex-1"
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
                  className={`min-h-[38px] rounded-[6px] text-[10px] md:text-[11px] font-bold tracking-widest border transition-colors ${
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
                className="min-h-[38px] rounded-[6px] text-[11px] font-bold tracking-widest bg-[#ffcc00] text-black hover:bg-[#ffcc00]/80 transition-colors"
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
                className="min-h-[38px] rounded-[6px] text-[11px] font-bold tracking-widest bg-black border border-[#ffcc00] text-[#ffcc00] hover:bg-[#1a1a00] transition-colors"
              >
                STOP AUDIO
              </button>
            </div>
          </div>
        </div>

        {/* ALARM PANEL (V74 DASHED CARD) */}
        <div className="relative border-2 border-dashed border-[#ffcc00] rounded-[14px] p-3 md:p-4 bg-[#050500] min-h-[90px] flex flex-col gap-0">
          <div className="flex justify-between items-center">
            <span className="text-[10px] tracking-[0.25em] opacity-60">
              ALARM - CLICK TO SET - {alarmArmed ? "ARMED" : "OFF"}
            </span>
            <span
              className={`text-[10px] px-2 py-[2px] rounded border ${
                alarmArmed ? "border-green-400 text-green-400" : "border-[#ffcc00]/40 text-[#ffcc00]/60"
              }`}
            >
              {alarmArmed ? "ARMED" : "OFF"}
            </span>
          </div>

          {/* Centered Clickable Alarm Readout */}
          <div
            onClick={() => setModalMode("alarm")}
            className="mt-3 cursor-pointer select-none text-center py-3 border border-[#ffcc00]/30 rounded-[10px] bg-black hover:bg-[#111100] transition-colors"
          >
            <div className="text-[40px] md:text-[44px] font-black tracking-widest leading-none text-[#ffcc00]">
              {formatHM(alarmHour, alarmMinute)} {alarmArmed ? "ARMED" : "OFF"}
            </div>
            <div className="text-[10px] opacity-50 mt-1 tracking-widest">TAP TO EDIT - HH:MM</div>
          </div>

          {/* Alarm Action Buttons */}
          <div className="grid grid-cols-3 gap-2 mt-3 w-full">
            <button
              type="button"
              onClick={armAlarm}
              className="bg-[#00c853] text-black font-bold min-h-[44px] rounded-[6px] text-[12px] tracking-widest hover:brightness-110 whitespace-nowrap overflow-hidden"
            >
              ARM 24HR
            </button>
            <button
              type="button"
              onClick={disarmAlarm}
              className="bg-black border border-[#ffcc00] text-[#ffcc00] font-bold min-h-[44px] rounded-[6px] text-[12px] tracking-widest hover:bg-[#1a1a00] whitespace-nowrap overflow-hidden"
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
              className="bg-[#ff1744] text-white font-bold min-h-[44px] rounded-[6px] text-[12px] tracking-widest hover:brightness-110 whitespace-nowrap overflow-hidden"
            >
              STOP ALARM
            </button>
          </div>

          {/* Volume A */}
          <div className="mt-3 flex items-center gap-3">
            <span className="text-[10px] w-[40px] opacity-60">VOL A</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={alarmVol}
              onChange={(e) => setAlarmVol(parseFloat(e.target.value))}
              className="flex-1"
            />
            <span className="text-[11px] w-[30px] text-right">{alarmVol.toFixed(2)}</span>
          </div>

          {/* Status Line */}
          <div className="mt-2 text-[11px] tracking-wide opacity-70 min-h-[18px] w-full text-left">
            {alarmStatus}
          </div>
        </div>

        {/* FOOTER */}
        <footer className="mt-6 text-center text-[10px] opacity-40 tracking-widest py-4">
          © {new Date().getFullYear()} CTU • ALL SECONDS ACCOUNTED FOR
        </footer>
      </main>

      {/* FULLSCREEN 10-SECOND COUNTDOWN TAKEOVER OVERLAY */}
      {takeoverActive && (
        <div
          className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center cursor-pointer select-none"
          style={{
            background: "rgba(0,0,0,0.97)",
            borderLeft: `10px solid ${isTakeoverCrisis ? "#ff0000" : "#ffcc00"}`,
          }}
          onClick={cancelTakeover}
        >
          <div
            className="glow font-black leading-none"
            style={{
              fontSize: "clamp(90px, 26vw, 240px)",
              color: isTakeoverCrisis ? "#ff4444" : "#ffcc00",
              textShadow: isTakeoverCrisis ? "0 0 20px #f00" : "0 0 20px #ffcc00",
            }}
          >
            {takeoverCount}
          </div>
          <div className="mt-4 text-[18px] tracking-[0.35em] text-center">{takeoverTitle}</div>
          <div className="mt-2 text-[12px] opacity-60 tracking-widest">TAP TO CANCEL</div>
          <div className="mt-8 h-[10px] w-[70%] max-w-[400px] bg-[#1a1a00] rounded overflow-hidden border border-[#ffcc00]/20">
            <div
              className="h-full transition-all duration-1000"
              style={{
                width: `${
                  ((takeoverInitialCountRef.current - takeoverCount + 1) /
                    (takeoverInitialCountRef.current + 1)) *
                  100
                }%`,
                background: isTakeoverCrisis ? "#f00" : "#ffcc00",
              }}
            />
          </div>
        </div>
      )}

      {/* SAMSUNG GALAXY SLIDE DRUM PICKER MODAL */}
      {modalMode && (
        <div className="fixed inset-0 z-[10000] bg-black/70 backdrop-blur-[2px] flex items-center justify-center p-3">
          <SamsungTimePicker
            mode={modalMode}
            initialHours={modalMode === "timer" ? Math.floor(timerDuration / 3600) : alarmHour}
            initialMinutes={modalMode === "timer" ? Math.floor((timerDuration % 3600) / 60) : alarmMinute}
            initialSeconds={modalMode === "timer" ? timerDuration % 60 : 0}
            onSave={handleModalSave}
            onCancel={() => setModalMode(null)}
          />
        </div>
      )}

      {/* FULLSCREEN VIDEO MODAL (OPENING & CREDITS) */}
      {activeVideoModal && (
        <div className="fixed inset-0 z-[10001] bg-black/90 flex flex-col items-center justify-center p-4">
          <div className="relative w-full max-w-[800px] bg-black border-2 border-[#ffcc00] rounded-[12px] overflow-hidden shadow-[0_0_30px_rgba(255,204,0,0.4)]">
            <div className="flex justify-between items-center px-4 py-2 bg-[#1a1a00] border-b border-[#ffcc00]/40">
              <span className="text-[12px] font-bold tracking-widest text-[#ffcc00]">
                {activeVideoModal === "opening" ? "CTU BROADCAST • 24 OPENING" : "CTU ARCHIVE • ENDING CREDITS"}
              </span>
              <button
                type="button"
                onClick={() => setActiveVideoModal(null)}
                className="text-[11px] font-bold tracking-widest text-[#ffcc00] hover:text-white px-2 py-1"
              >
                [CLOSE ✕]
              </button>
            </div>
            <video
              src={activeVideoModal === "opening" ? "/24 Opening.mp4" : "/24 Closing.mp4"}
              controls
              autoPlay
              playsInline
              className="w-full aspect-video bg-black"
            />
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      <div
        className={`fixed left-1/2 -translate-x-1/2 bottom-[30px] z-[80] bg-black border border-[#ffcc00] text-[#ffcc00] px-4 py-2 rounded-[8px] text-[12px] tracking-wide shadow-[0_0_20px_rgba(255,204,0,0.4)] transition-all duration-300 ${
          toastMessage ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        }`}
        style={{ maxWidth: "90vw", whiteSpace: "nowrap" }}
      >
        {toastMessage}
      </div>
    </div>
  );
}
