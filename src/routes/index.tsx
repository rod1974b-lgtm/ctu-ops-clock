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
  { id: "standdown", label: "STAND-DOWN", durationSec: 5 * 60 },
  { id: "test10", label: "COUNTDOWN (10S)", durationSec: 10 },
];

const INITIAL_TIMERS: OperationalTimer[] = [
  {
    id: "timer-1",
    label: "PRIMARY OPERATION",
    durationSec: 25 * 60,
    remainingSec: 25 * 60,
    running: false,
    timesUp: false,
    status: "READY",
  },
];

const INITIAL_ALARMS: OperationalAlarm[] = [
  {
    id: "alarm-1",
    label: "DAILY BRIEFING",
    hour: 7,
    minute: 0,
    armed: true,
  },
];

// Global Operational Theaters for the Moving World Time Ticker
// Sequenced West to East chronologically
interface WorldTheater {
  code: string;
  city: string;
  zone: string;
  isHome?: boolean;
}

const WORLD_THEATERS: WorldTheater[] = [
  { code: "LAX", city: "LOS ANGELES (CTU)", zone: "America/Los_Angeles" },
  { code: "DEN", city: "DENVER", zone: "America/Denver" },
  { code: "CHI", city: "CHICAGO", zone: "America/Chicago" },
  { code: "WAS", city: "WASHINGTON D.C.", zone: "America/New_York" },
  { code: "NYC", city: "NEW YORK", zone: "America/New_York" },
  { code: "SAO", city: "SÃO PAULO", zone: "America/Sao_Paulo" },
  { code: "UTC", city: "ZULU HQ", zone: "UTC" },
  { code: "LON", city: "LONDON (MI6)", zone: "Europe/London" },
  { code: "PAR", city: "PARIS", zone: "Europe/Paris" },
  { code: "BER", city: "BERLIN", zone: "Europe/Berlin" },
  { code: "CAI", city: "CAIRO", zone: "Africa/Cairo" },
  { code: "MOW", city: "MOSCOW", zone: "Europe/Moscow" },
  { code: "DXB", city: "DUBAI", zone: "Asia/Dubai" },
  { code: "BKK", city: "BANGKOK [ACTIVE]", zone: "Asia/Bangkok", isHome: true },
  { code: "SIN", city: "SINGAPORE", zone: "Asia/Singapore" },
  { code: "HKG", city: "HONG KONG", zone: "Asia/Hong_Kong" },
  { code: "TYO", city: "TOKYO", zone: "Asia/Tokyo" },
  { code: "SYD", city: "SYDNEY", zone: "Australia/Sydney" },
  { code: "AKL", city: "AUCKLAND", zone: "Pacific/Auckland" },
  { code: "HNL", city: "HONOLULU", zone: "Pacific/Honolulu" },
];

const WATERCOLOR_IMAGES = [
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

const CREDITS_NAMES = [
  { role: "EXECUTIVE PRODUCER", name: "JOEL SURNOW & ROBERT COCHRAN" },
  { role: "EXECUTIVE PRODUCER", name: "HOWARD GORDON" },
  { role: "EXECUTIVE PRODUCER", name: "BRIAN GRAZER & TONY KRANTZ" },
  { role: "CO-EXECUTIVE PRODUCER", name: "STEPHEN KRONISH" },
  { role: "PRODUCER", name: "MICHAEL LoCELLO" },
  { role: "PRODUCER", name: "ROBIN BLAETHLER" },
  { role: "SUPERVISING PRODUCER", name: "REMINGTON BLAIR" },
  { role: "CREATED BY", name: "JOEL SURNOW & ROBERT COCHRAN" },
  { role: "DIRECTED BY", name: "JON CASSER" },
  { role: "MUSIC BY", name: "SEAN CALLERY" },
  { role: "DIRECTOR OF PHOTOGRAPHY", name: "RODNEY CHARTERS, C.S.C." },
  { role: "PRODUCTION DESIGNER", name: "JOSEPH A. HODGES" },
  { role: "EDITED BY", name: "CHRIS WILLINGHAM, A.C.E." },
  { role: "STUNT COORDINATOR", name: "JEFF CADIENTE" },
  { role: "SPECIAL EFFECTS", name: "KEN NORDINE" },
  { role: "CTU TACTICAL ADVISOR", name: "SCOTT RODORIGO" },
  { role: "LEAD PROTOCOL AGENT", name: "JACK BAUER" },
  { role: "CHIEF OF COMMUNICATIONS", name: "CHLOE O'BRIAN" },
  { role: "DIRECTOR OF CTU", name: "BILL BUCHANAN" },
  { role: "SENIOR FIELD AGENT", name: "TONY ALMEIDA" },
  { role: "PRESIDENT OF THE UNITED STATES", name: "DAVID PALMER" },
];

function CTUTerminalV74() {
  // Prevent SSR hydration mismatch: start from a fixed date, then update on mount
  const [now, setNow] = useState<Date>(() => new Date(0));
  const [colonVisible, setColonVisible] = useState(true);

  // User Settings State (Hydrated & Persisted to localStorage)
  const [zeroSound, setZeroSound] = useState<ZeroSoundType>("voice");
  const [volume, setVolume] = useState(0.85);
  const [creditsMusic, setCreditsMusic] = useState(true);
  const [creditsMode, setCreditsMode] = useState<"watercolor" | "video">("watercolor");

  // Operational Multi-Timers & Multi-Alarms
  const [timers, setTimers] = useState<OperationalTimer[]>(INITIAL_TIMERS);
  const [alarms, setAlarms] = useState<OperationalAlarm[]>(INITIAL_ALARMS);

  // Active / Focused Timer ID
  const [activeTimerId, setActiveTimerId] = useState<string>("timer-1");

  // Modals & Panels
  const [openingOpen, setOpeningOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [creditsImageOffset, setCreditsImageOffset] = useState(0);

  // Unified Samsung HH:MM:SS Time Picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<"timer" | "alarm">("timer");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [pickerInitial, setPickerInitial] = useState<SamsungTimePickerValues>({
    hours: 0,
    minutes: 25,
    seconds: 0,
    totalSeconds: 25 * 60,
  });

  // Fullscreen Countdown / Crisis Takeover State
  const [countdownActive, setCountdownActive] = useState(false);
  const [countdownRemaining, setCountdownRemaining] = useState(10);
  const [countdownLabel, setCountdownLabel] = useState("");
  const [crisisTimesUp, setCrisisTimesUp] = useState(false);

  // Audio Context Ref
  const audioUnlockedRef = useRef(false);

  // Hydrate user settings and saved timers/alarms from localStorage after mount
  useEffect(() => {
    try {
      const savedTimers = localStorage.getItem("ctu_timers");
      if (savedTimers) {
        const parsed = JSON.parse(savedTimers);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTimers(parsed);
          setActiveTimerId(parsed[0].id);
        }
      }

      const savedAlarms = localStorage.getItem("ctu_alarms");
      if (savedAlarms) {
        const parsed = JSON.parse(savedAlarms);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setAlarms(parsed);
        }
      }

      const savedSound = localStorage.getItem("ctu_zero_sound") as ZeroSoundType;
      if (savedSound && ZERO_SOUND_LABELS[savedSound]) {
        setZeroSound(savedSound);
      }

      const savedVol = localStorage.getItem("ctu_volume");
      if (savedVol) {
        const v = parseFloat(savedVol);
        if (!isNaN(v) && v >= 0 && v <= 1) {
          setVolume(v);
          CTUAudio.setVolume(v);
        }
      }

      const savedCreditsMusic = localStorage.getItem("ctu_credits_music");
      if (savedCreditsMusic !== null) setCreditsMusic(savedCreditsMusic === "true");

      const savedCreditsMode = localStorage.getItem("ctu_credits_mode");
      if (savedCreditsMode === "watercolor" || savedCreditsMode === "video") {
        setCreditsMode(savedCreditsMode);
      }
    } catch {
      // Ignore localStorage exceptions in restricted contexts
    }
  }, []);

  // Update clock every second & toggle blinking colon
  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => {
      setNow(new Date());
      setColonVisible((prev) => !prev);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Rotate watercolor images every 7 seconds during credits mode
  useEffect(() => {
    if (!creditsOpen || creditsMode !== "watercolor") return;
    const interval = setInterval(() => {
      setCreditsImageOffset((prev) => (prev + 6) % WATERCOLOR_IMAGES.length);
    }, 7000);
    return () => clearInterval(interval);
  }, [creditsOpen, creditsMode]);

  // Persist Timers
  const saveTimers = useCallback((updated: OperationalTimer[]) => {
    setTimers(updated);
    try {
      localStorage.setItem("ctu_timers", JSON.stringify(updated));
    } catch {
      // Ignore
    }
  }, []);

  // Persist Alarms
  const saveAlarms = useCallback((updated: OperationalAlarm[]) => {
    setAlarms(updated);
    try {
      localStorage.setItem("ctu_alarms", JSON.stringify(updated));
    } catch {
      // Ignore
    }
  }, []);

  // Sound selection handler
  const handleZeroSoundChange = (sound: ZeroSoundType) => {
    setZeroSound(sound);
    try {
      localStorage.setItem("ctu_zero_sound", sound);
    } catch {
      // Ignore
    }
  };

  // Volume slider handler
  const handleVolumeChange = (vol: number) => {
    setVolume(vol);
    CTUAudio.setVolume(vol);
    try {
      localStorage.setItem("ctu_volume", vol.toString());
    } catch {
      // Ignore
    }
  };

  // Unlock Web Audio on first user interaction
  const unlockAudio = useCallback(() => {
    if (!audioUnlockedRef.current) {
      CTUAudio.resumeContext();
      audioUnlockedRef.current = true;
    }
  }, []);

  // Timer Tick Engine: Drift-free second decrementer
  useEffect(() => {
    const timerInterval = setInterval(() => {
      setTimers((prevTimers) => {
        let hasRunning = false;
        const next = prevTimers.map((t) => {
          if (!t.running) return t;
          hasRunning = true;
          const nextSec = t.remainingSec - 1;

          // Check for final 10-second escalation threshold
          if (nextSec === 10 && t.id === activeTimerId) {
            setCountdownActive(true);
            setCountdownRemaining(10);
            setCountdownLabel(t.label);
            CTUAudio.playCountdown(10);
          } else if (nextSec < 10 && nextSec > 0 && t.id === activeTimerId) {
            setCountdownRemaining(nextSec);
            CTUAudio.playCountdown(nextSec);
          } else if (nextSec <= 0) {
            if (t.id === activeTimerId) {
              setCountdownActive(false);
              setCrisisTimesUp(true);
              CTUAudio.playZeroSound(zeroSound);
            }
            return {
              ...t,
              remainingSec: 0,
              running: false,
              timesUp: true,
              status: "AT ZERO // CRISIS",
            };
          }

          return {
            ...t,
            remainingSec: nextSec,
            status: "EXECUTING",
          };
        });

        if (hasRunning) {
          try {
            localStorage.setItem("ctu_timers", JSON.stringify(next));
          } catch {
            // Ignore
          }
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timerInterval);
  }, [activeTimerId, zeroSound]);

  // Alarm Check Engine: Bangkok operational time check
  useEffect(() => {
    const alarmInterval = setInterval(() => {
      const bkkHour = parseInt(
        new Intl.DateTimeFormat("en-US", {
          hour: "numeric",
          hour12: false,
          timeZone: "Asia/Bangkok",
        }).format(now),
        10
      );
      const bkkMin = parseInt(
        new Intl.DateTimeFormat("en-US", {
          minute: "numeric",
          timeZone: "Asia/Bangkok",
        }).format(now),
        10
      );
      const bkkSec = parseInt(
        new Intl.DateTimeFormat("en-US", {
          second: "numeric",
          timeZone: "Asia/Bangkok",
        }).format(now),
        10
      );

      alarms.forEach((a) => {
        if (a.armed && a.hour === bkkHour && a.minute === bkkMin && bkkSec === 0) {
          setCountdownLabel(`ALARM: ${a.label}`);
          setCrisisTimesUp(true);
          CTUAudio.playZeroSound(zeroSound);
        }
      });
    }, 1000);

    return () => clearInterval(alarmInterval);
  }, [now, alarms, zeroSound]);

  // Active / Primary Timer
  const activeTimer = useMemo(() => {
    return timers.find((t) => t.id === activeTimerId) || timers[0];
  }, [timers, activeTimerId]);

  // Format HH:MM:SS
  const formatTime = (totalSec: number) => {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return {
      h: h.toString().padStart(2, "0"),
      m: m.toString().padStart(2, "0"),
      s: s.toString().padStart(2, "0"),
    };
  };

  const primaryDigits = formatTime(activeTimer?.remainingSec ?? 0);

  // Bangkok Operational Live Time
  const bangkokTime = useMemo(() => {
    const formatter = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "Asia/Bangkok",
    });
    const parts = formatter.formatToParts(now);
    const h = parts.find((p) => p.type === "hour")?.value ?? "00";
    const m = parts.find((p) => p.type === "minute")?.value ?? "00";
    const s = parts.find((p) => p.type === "second")?.value ?? "00";
    return { h, m, s };
  }, [now]);

  // Zulu / UTC Time
  const zuluTime = useMemo(() => {
    const h = now.getUTCHours().toString().padStart(2, "0");
    const m = now.getUTCMinutes().toString().padStart(2, "0");
    const s = now.getUTCSeconds().toString().padStart(2, "0");
    return `${h}:${m}:${s}Z`;
  }, [now]);

  // Dynamic Chronological Sorting for Moving World Time Ticker
  const sortedTheaters = useMemo(() => {
    return [...WORLD_THEATERS].sort((a, b) => {
      const getSeconds = (tz: string) => {
        try {
          const parts = new Intl.DateTimeFormat("en-US", {
            hour: "numeric",
            minute: "numeric",
            second: "numeric",
            hour12: false,
            timeZone: tz,
          }).formatToParts(now);
          const h = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
          const m = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
          const s = parseInt(parts.find((p) => p.type === "second")?.value || "0", 10);
          return h * 3600 + m * 60 + s;
        } catch {
          return 0;
        }
      };
      return getSeconds(a.zone) - getSeconds(b.zone);
    });
  }, [now]);

  // Format theater time string
  const formatTheaterTime = (tz: string) => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZone: tz,
      }).format(now);
    } catch {
      return "--:--:--";
    }
  };

  // Primary Operations Controls
  const handleStartPrimary = () => {
    unlockAudio();
    saveTimers(
      timers.map((t) =>
        t.id === activeTimer.id ? { ...t, running: true, timesUp: false, status: "EXECUTING" } : t
      )
    );
  };

  const handlePausePrimary = () => {
    saveTimers(
      timers.map((t) =>
        t.id === activeTimer.id ? { ...t, running: false, status: "HOLD" } : t
      )
    );
  };

  const handleResetPrimary = () => {
    CTUAudio.stopAll();
    setCountdownActive(false);
    setCrisisTimesUp(false);
    saveTimers(
      timers.map((t) =>
        t.id === activeTimer.id
          ? {
              ...t,
              running: false,
              timesUp: false,
              remainingSec: t.durationSec,
              status: "STANDBY",
            }
          : t
      )
    );
  };

  const handleApplyPreset = (presetDuration: number, presetLabel: string) => {
    unlockAudio();
    CTUAudio.stopAll();
    setCountdownActive(false);
    setCrisisTimesUp(false);
    saveTimers(
      timers.map((t) =>
        t.id === activeTimer.id
          ? {
              ...t,
              durationSec: presetDuration,
              remainingSec: presetDuration,
              running: false,
              timesUp: false,
              label: presetLabel,
              status: "ARMED",
            }
          : t
      )
    );
  };

  // Open Unified Samsung HH:MM:SS Time Picker for Timer
  const handleOpenTimerPicker = (timer: OperationalTimer) => {
    unlockAudio();
    setEditingItemId(timer.id);
    setPickerMode("timer");
    const h = Math.floor(timer.durationSec / 3600);
    const m = Math.floor((timer.durationSec % 3600) / 60);
    const s = timer.durationSec % 60;
    setPickerInitial({ hours: h, minutes: m, seconds: s, totalSeconds: timer.durationSec });
    setPickerOpen(true);
  };

  // Open Unified Samsung HH:MM:SS Time Picker for Alarm
  const handleOpenAlarmPicker = (alarm: OperationalAlarm) => {
    unlockAudio();
    setEditingItemId(alarm.id);
    setPickerMode("alarm");
    setPickerInitial({
      hours: alarm.hour,
      minutes: alarm.minute,
      seconds: 0,
      totalSeconds: alarm.hour * 3600 + alarm.minute * 60,
    });
    setPickerOpen(true);
  };

  // Save from Unified Samsung HH:MM:SS Time Picker
  const handlePickerSave = (values: SamsungTimePickerValues) => {
    if (pickerMode === "timer" && editingItemId) {
      const total = values.hours * 3600 + values.minutes * 60 + values.seconds;
      const duration = Math.max(1, total);
      saveTimers(
        timers.map((t) =>
          t.id === editingItemId
            ? {
                ...t,
                durationSec: duration,
                remainingSec: duration,
                running: false,
                timesUp: false,
                status: "ARMED",
              }
            : t
        )
      );
    } else if (pickerMode === "alarm" && editingItemId) {
      saveAlarms(
        alarms.map((a) =>
          a.id === editingItemId
            ? {
                ...a,
                hour: values.hours,
                minute: values.minutes,
                armed: true,
              }
            : a
        )
      );
    }
    setPickerOpen(false);
    setEditingItemId(null);
  };

  // Add / Delete Timers
  const handleAddTimer = () => {
    const newId = `timer-${Date.now()}`;
    const newTimer: OperationalTimer = {
      id: newId,
      label: `OP-${timers.length + 1} TACTICAL`,
      durationSec: 15 * 60,
      remainingSec: 15 * 60,
      running: false,
      timesUp: false,
      status: "ARMED",
    };
    saveTimers([...timers, newTimer]);
    setActiveTimerId(newId);
  };

  const handleDeleteTimer = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (timers.length <= 1) return;
    const remaining = timers.filter((t) => t.id !== id);
    saveTimers(remaining);
    if (activeTimerId === id) {
      setActiveTimerId(remaining[0].id);
    }
  };

  // Add / Delete Alarms
  const handleAddAlarm = () => {
    const newId = `alarm-${Date.now()}`;
    const newAlarm: OperationalAlarm = {
      id: newId,
      label: `INTEL CHECK ${alarms.length + 1}`,
      hour: 12,
      minute: 0,
      armed: true,
    };
    saveAlarms([...alarms, newAlarm]);
  };

  const handleDeleteAlarm = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (alarms.length <= 1) return;
    saveAlarms(alarms.filter((a) => a.id !== id));
  };

  const handleToggleAlarm = (id: string) => {
    saveAlarms(
      alarms.map((a) => (a.id === id ? { ...a, armed: !a.armed } : a))
    );
  };

  // Crisis Dismissal
  const handleDismissCrisis = () => {
    CTUAudio.stopAll();
    setCrisisTimesUp(false);
    setCountdownActive(false);
  };

  // Modals & Media Controls
  const handleOpenOpening = () => {
    unlockAudio();
    setOpeningOpen(true);
  };

  const handleCloseOpening = () => {
    setOpeningOpen(false);
  };

  const handleOpenCredits = () => {
    unlockAudio();
    setCreditsOpen(true);
    if (creditsMusic) {
      CTUAudio.startCreditsAudio();
    }
  };

  const handleCloseCredits = () => {
    setCreditsOpen(false);
    CTUAudio.stopCreditsAudio();
  };

  const handleCreditsMusicToggle = () => {
    const next = !creditsMusic;
    setCreditsMusic(next);
    if (next && creditsOpen) {
      CTUAudio.startCreditsAudio();
    } else {
      CTUAudio.stopCreditsAudio();
    }
    try {
      localStorage.setItem("ctu_credits_music", next ? "true" : "false");
    } catch {
      // Ignore
    }
  };

  const handleCreditsModeChange = (mode: "watercolor" | "video") => {
    setCreditsMode(mode);
    try {
      localStorage.setItem("ctu_credits_mode", mode);
    } catch {
      // Ignore
    }
  };

  // Audio Testing functions
  const handleTestCountdown = () => {
    unlockAudio();
    CTUAudio.playCountdown(10);
  };

  const handleTestZeroSound = () => {
    unlockAudio();
    CTUAudio.playZeroSound(zeroSound);
  };

  return (
    <main
      onClick={unlockAudio}
      className="min-h-screen bg-[#050505] text-[#ffcc00] font-mono select-none flex flex-col justify-between p-2 md:p-6 overflow-x-hidden relative"
    >
      {/* Top Header Command Banner */}
      <header className="border-b border-[#ffcc00]/40 pb-3 flex flex-wrap items-center justify-between gap-3 bg-black/40 px-3 py-2 border border-[#ffcc00]/20 shadow-[0_0_15px_rgba(255,204,0,0.1)]">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-[#ffcc00] animate-pulse" />
          <h1 className="text-xl md:text-2xl font-black tracking-widest text-[#ffcc00] glow">
            CTU TACTICAL OPERATIONAL COMMAND
          </h1>
          <span className="hidden md:inline-block bg-[#ffcc00]/20 text-[#ffcc00] text-[10px] px-2 py-0.5 border border-[#ffcc00]/50 font-bold">
            LEVEL-4 CLEARANCE
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs tracking-wider">
          <div className="flex items-center gap-1.5">
            <span className="text-[#ffcc00]/60">ZULU:</span>
            <span className="font-bold text-[#ffcc00]">{zuluTime}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[#ffcc00]/60">THREATCON:</span>
            <span className="text-red-500 font-bold animate-pulse">CRIMSON</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenOpening}
              className="px-2.5 py-1 bg-[#ffcc00]/10 hover:bg-[#ffcc00]/25 border border-[#ffcc00] text-[11px] font-bold tracking-widest transition"
            >
              TRANSMISSION
            </button>
            <button
              onClick={handleOpenCredits}
              className="px-2.5 py-1 bg-[#ffcc00]/10 hover:bg-[#ffcc00]/25 border border-[#ffcc00] text-[11px] font-bold tracking-widest transition"
            >
              CREDITS
            </button>
          </div>
        </div>
      </header>

      {/* Main Tactical Grid Viewport */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 my-4 flex-grow">
        {/* Left Column: Mission Time & Primary Operations (lg:col-span-8) */}
        <section className="lg:col-span-8 flex flex-col gap-4">
          {/* Unified Mission Clock & Primary Countdown Area */}
          <div className="border-2 border-[#ffcc00] bg-black/90 p-4 md:p-6 shadow-[0_0_20px_rgba(255,204,0,0.15)] flex flex-col justify-between">
            {/* Top Bar: Operations Info */}
            <div className="flex flex-wrap items-center justify-between border-b border-[#ffcc00]/30 pb-2 mb-4 text-xs font-bold tracking-widest">
              <div className="flex items-center gap-2">
                <span className="text-[#ffcc00]/60">ACTIVE TARGET:</span>
                <span className="text-[#ffcc00] text-sm md:text-base">
                  {activeTimer.label}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[#ffcc00]/60">STATUS:</span>
                <span
                  className={`px-2 py-0.5 border ${
                    activeTimer.running
                      ? "border-green-500 text-green-400 bg-green-950/30 animate-pulse"
                      : activeTimer.timesUp
                      ? "border-red-500 text-red-500 bg-red-950/40 animate-pulse"
                      : "border-[#ffcc00]/40 text-[#ffcc00]"
                  }`}
                >
                  {activeTimer.status}
                </span>
              </div>
            </div>

            {/* Side-by-Side Dual Seven-Segment Displays (PC) / Stacked (Mobile) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-2">
              {/* Box A: Bangkok Local Mission Time */}
              <div className="border border-[#ffcc00]/30 bg-black/60 p-3 md:p-4 flex flex-col items-center justify-center">
                <span className="text-[11px] font-bold text-[#ffcc00]/70 tracking-widest mb-1">
                  LOCAL MISSION TIME (BANGKOK UTC+7)
                </span>
                <div className="text-4xl sm:text-5xl md:text-6xl font-black text-[#ffcc00] tracking-wider tabular-nums glow flex items-center justify-center">
                  <span>{bangkokTime.h}</span>
                  <span className={`mx-0.5 ${colonVisible ? "opacity-100" : "opacity-20"}`}>
                    :
                  </span>
                  <span>{bangkokTime.m}</span>
                  <span className={`mx-0.5 ${colonVisible ? "opacity-100" : "opacity-20"}`}>
                    :
                  </span>
                  <span>{bangkokTime.s}</span>
                </div>
                <span className="text-[9px] text-[#ffcc00]/50 tracking-widest mt-1">
                  SYNCHRONIZED WITH CTU MAIN CLOCK
                </span>
              </div>

              {/* Box B: Primary Operation Countdown Display */}
              <div
                onClick={() => handleOpenTimerPicker(activeTimer)}
                className="border border-[#ffcc00]/30 bg-black/60 p-3 md:p-4 flex flex-col items-center justify-center cursor-pointer hover:border-[#ffcc00] transition group"
                title="Tap to set Hours, Minutes, and Seconds via Samsung Drum Picker"
              >
                <div className="flex items-center justify-between w-full text-[11px] font-bold text-[#ffcc00]/70 tracking-widest mb-1">
                  <span>COUNTDOWN TIMEOUT</span>
                  <span className="text-[9px] group-hover:text-[#ffcc00] underline">
                    TAP TO EDIT [HH:MM:SS]
                  </span>
                </div>
                <div
                  className={`text-4xl sm:text-5xl md:text-6xl font-black tracking-wider tabular-nums flex items-center justify-center ${
                    activeTimer.remainingSec <= 10 && activeTimer.remainingSec > 0
                      ? "text-red-500 animate-pulse glow"
                      : "text-[#ffcc00] glow"
                  }`}
                >
                  <span>{primaryDigits.h}</span>
                  <span className={`mx-0.5 ${colonVisible ? "opacity-100" : "opacity-20"}`}>
                    :
                  </span>
                  <span>{primaryDigits.m}</span>
                  <span className={`mx-0.5 ${colonVisible ? "opacity-100" : "opacity-20"}`}>
                    :
                  </span>
                  <span>{primaryDigits.s}</span>
                </div>
                <span className="text-[9px] text-[#ffcc00]/50 tracking-widest mt-1">
                  SECURE TACTICAL TIMEOUT
                </span>
              </div>
            </div>

            {/* Quick Tactical Presets Bar */}
            <div className="mt-4 pt-3 border-t border-[#ffcc00]/20 flex flex-wrap items-center gap-2">
              <span className="text-[10px] text-[#ffcc00]/60 font-bold tracking-widest">
                PRESETS:
              </span>
              {CTU_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleApplyPreset(p.durationSec, p.label)}
                  className="px-2.5 py-1 text-[11px] font-bold tracking-wider border border-[#ffcc00]/40 bg-[#ffcc00]/5 hover:bg-[#ffcc00]/20 hover:border-[#ffcc00] transition"
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Tactical Control Buttons */}
            <div className="grid grid-cols-3 gap-2 mt-4 pt-2">
              {!activeTimer.running ? (
                <button
                  onClick={handleStartPrimary}
                  className="py-3 bg-[#ffcc00] text-black font-black text-sm md:text-base tracking-widest hover:bg-[#ffe066] transition shadow-[0_0_10px_rgba(255,204,0,0.4)]"
                >
                  EXECUTE
                </button>
              ) : (
                <button
                  onClick={handlePausePrimary}
                  className="py-3 bg-red-600 text-black font-black text-sm md:text-base tracking-widest hover:bg-red-500 transition shadow-[0_0_10px_rgba(255,0,0,0.4)]"
                >
                  HOLD OP
                </button>
              )}
              <button
                onClick={handleResetPrimary}
                className="py-3 border border-[#ffcc00] text-[#ffcc00] font-black text-sm md:text-base tracking-widest hover:bg-[#ffcc00]/20 transition"
              >
                STANDBY
              </button>
              <button
                onClick={() => handleOpenTimerPicker(activeTimer)}
                className="py-3 border border-[#ffcc00] text-[#ffcc00] font-black text-sm md:text-base tracking-widest hover:bg-[#ffcc00]/20 transition"
              >
                SET TIME
              </button>
            </div>
          </div>

          {/* Medium Sized Chronological Moving World Time Ticker (120s smooth command crawl) */}
          <div className="border border-[#ffcc00]/30 bg-black/80 p-2 overflow-hidden relative shadow-[0_0_10px_rgba(255,204,0,0.05)]">
            <div className="flex items-center justify-between pb-1.5 px-2 border-b border-[#ffcc00]/20 text-[10px] tracking-widest font-bold">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-[#ffcc00] animate-ping" />
                GLOBAL THEATER TELEMETRY // REAL-TIME SYNCHRONIZATION
              </span>
              <span className="text-[#ffcc00]/50">CHRONOLOGICAL GLIDE (WEST → EAST)</span>
            </div>

            <div className="world-ticker-wrapper py-1.5 overflow-hidden whitespace-nowrap">
              <div className="world-ticker-track flex items-center gap-8">
                {/* Primary Loop */}
                {sortedTheaters.map((t) => (
                  <div
                    key={`p-${t.code}`}
                    className={`inline-flex items-center gap-2 px-2 py-0.5 border ${
                      t.isHome
                        ? "border-[#ffcc00] bg-[#ffcc00]/20 font-black text-[#ffcc00]"
                        : "border-[#ffcc00]/20 text-[#ffcc00]/80"
                    }`}
                  >
                    <span className="text-[11px] font-bold tracking-widest">
                      {t.code} // {t.city}:
                    </span>
                    <span className="text-[12px] font-mono tabular-nums text-[#ffcc00] font-bold">
                      {formatTheaterTime(t.zone)}
                    </span>
                  </div>
                ))}
                {/* Secondary Seamless Loop */}
                {sortedTheaters.map((t) => (
                  <div
                    key={`s-${t.code}`}
                    className={`inline-flex items-center gap-2 px-2 py-0.5 border ${
                      t.isHome
                        ? "border-[#ffcc00] bg-[#ffcc00]/20 font-black text-[#ffcc00]"
                        : "border-[#ffcc00]/20 text-[#ffcc00]/80"
                    }`}
                  >
                    <span className="text-[11px] font-bold tracking-widest">
                      {t.code} // {t.city}:
                    </span>
                    <span className="text-[12px] font-mono tabular-nums text-[#ffcc00] font-bold">
                      {formatTheaterTime(t.zone)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tactical Audio & Escalation Console */}
          <div className="border border-[#ffcc00]/30 bg-black/60 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-[#ffcc00]/20 pb-2 text-xs font-bold tracking-widest">
              <span>TACTICAL AUDIO MATRIX & ZERO ESCALATION</span>
              <span className="text-[10px] text-[#ffcc00]/60">MASTER: {Math.round(volume * 100)}%</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              {/* Zero Voice Sound Selector */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] text-[#ffcc00]/70 font-bold">
                  ZERO STRIKE SOUND PROTOCOL:
                </span>
                <select
                  value={zeroSound}
                  onChange={(e) => handleZeroSoundChange(e.target.value as ZeroSoundType)}
                  className="bg-black border border-[#ffcc00] text-[#ffcc00] p-2 text-xs font-bold tracking-widest focus:outline-none focus:ring-1 focus:ring-[#ffcc00]"
                >
                  <option value="voice">VOICE: 24 AT ZERO THEME</option>
                  <option value="boom">BOOM IMPACT</option>
                  <option value="alarm">ALARM KLAXON</option>
                  <option value="ctu_beep">CTU BEEP</option>
                  <option value="stinger">STINGER CHORD</option>
                </select>
              </div>

              {/* Master Volume Slider */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] text-[#ffcc00]/70 font-bold">
                  TACTICAL MASTER VOLUME:
                </span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="w-full accent-[#ffcc00] cursor-pointer"
                />
              </div>
            </div>

            {/* Audio Testing Trigger Buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#ffcc00]/20">
              <span className="text-[10px] text-[#ffcc00]/60 font-bold">AUDIO VERIFY:</span>
              <button
                onClick={handleTestCountdown}
                className="px-2.5 py-1 text-[11px] font-bold border border-[#ffcc00]/40 hover:bg-[#ffcc00]/20 transition"
              >
                TEST COUNTDOWN ALARM
              </button>
              <button
                onClick={handleTestZeroSound}
                className="px-2.5 py-1 text-[11px] font-bold border border-[#ffcc00]/40 hover:bg-[#ffcc00]/20 transition"
              >
                TEST ZERO STRIKE SOUND
              </button>
            </div>
          </div>
        </section>

        {/* Right Column: Multi-Timers & Multi-Alarms Management (lg:col-span-4) */}
        <section className="lg:col-span-4 flex flex-col gap-4">
          {/* Multiple Timers Queue Card */}
          <div className="border border-[#ffcc00]/40 bg-black/80 p-4 flex flex-col gap-3 shadow-[0_0_15px_rgba(255,204,0,0.08)]">
            <div className="flex items-center justify-between border-b border-[#ffcc00]/20 pb-2">
              <span className="text-xs font-bold tracking-widest text-[#ffcc00]">
                OPERATIONAL TIMERS QUEUE
              </span>
              <button
                onClick={handleAddTimer}
                className="text-[11px] font-bold border border-[#ffcc00] px-2 py-0.5 bg-[#ffcc00]/10 hover:bg-[#ffcc00]/30 transition"
              >
                + ADD OP
              </button>
            </div>

            <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
              {timers.map((t) => {
                const formatted = formatTime(t.remainingSec);
                const isSelected = t.id === activeTimerId;
                return (
                  <div
                    key={t.id}
                    onClick={() => setActiveTimerId(t.id)}
                    className={`p-2.5 border transition cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? "border-[#ffcc00] bg-[#ffcc00]/15"
                        : "border-[#ffcc00]/20 bg-black hover:border-[#ffcc00]/40"
                    }`}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-bold text-[#ffcc00] tracking-wide">
                        {t.label}
                      </span>
                      <span className="text-[10px] text-[#ffcc00]/60">
                        STATUS: {t.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenTimerPicker(t);
                        }}
                        className="text-sm font-black tabular-nums tracking-wider text-[#ffcc00] hover:underline"
                        title="Click to change hours, minutes, seconds"
                      >
                        {formatted.h}:{formatted.m}:{formatted.s}
                      </span>
                      {timers.length > 1 && (
                        <button
                          onClick={(e) => handleDeleteTimer(t.id, e)}
                          className="text-red-500 hover:text-red-400 font-bold text-xs px-1"
                          title="Delete Timer"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Multiple Daily Alarms Queue Card */}
          <div className="border border-[#ffcc00]/40 bg-black/80 p-4 flex flex-col gap-3 shadow-[0_0_15px_rgba(255,204,0,0.08)]">
            <div className="flex items-center justify-between border-b border-[#ffcc00]/20 pb-2">
              <span className="text-xs font-bold tracking-widest text-[#ffcc00]">
                DAILY TACTICAL ALARMS
              </span>
              <button
                onClick={handleAddAlarm}
                className="text-[11px] font-bold border border-[#ffcc00] px-2 py-0.5 bg-[#ffcc00]/10 hover:bg-[#ffcc00]/30 transition"
              >
                + ADD ALARM
              </button>
            </div>

            <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
              {alarms.map((a) => {
                const hStr = a.hour.toString().padStart(2, "0");
                const mStr = a.minute.toString().padStart(2, "0");
                return (
                  <div
                    key={a.id}
                    className="p-2.5 border border-[#ffcc00]/20 bg-black flex items-center justify-between"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-bold text-[#ffcc00] tracking-wide">
                        {a.label}
                      </span>
                      <span className="text-[10px] text-[#ffcc00]/60">
                        ZONE: BANGKOK (UTC+7)
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        onClick={() => handleOpenAlarmPicker(a)}
                        className="text-base font-black tabular-nums tracking-wider text-[#ffcc00] hover:underline cursor-pointer"
                        title="Click to edit alarm time"
                      >
                        {hStr}:{mStr}:00
                      </span>
                      <button
                        onClick={() => handleToggleAlarm(a.id)}
                        className={`text-[10px] font-bold px-2 py-0.5 border ${
                          a.armed
                            ? "border-green-500 text-green-400 bg-green-950/40"
                            : "border-gray-600 text-gray-500"
                        }`}
                      >
                        {a.armed ? "ARMED" : "OFF"}
                      </button>
                      {alarms.length > 1 && (
                        <button
                          onClick={(e) => handleDeleteAlarm(a.id, e)}
                          className="text-red-500 hover:text-red-400 font-bold text-xs px-1"
                          title="Delete Alarm"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tactical Intel Summary */}
          <div className="border border-[#ffcc00]/30 bg-black/60 p-4 text-xs flex flex-col gap-2">
            <span className="font-bold tracking-widest text-[#ffcc00] border-b border-[#ffcc00]/20 pb-1">
              SYSTEM INTEL // SPECS
            </span>
            <div className="flex justify-between text-[#ffcc00]/70">
              <span>TIMING DRIFT:</span>
              <span className="font-bold text-[#ffcc00]">0.00 MS [WORKER SYNC]</span>
            </div>
            <div className="flex justify-between text-[#ffcc00]/70">
              <span>LOCAL ENCRYPTION:</span>
              <span className="font-bold text-[#ffcc00]">LOCALSTORAGE PERSISTED</span>
            </div>
            <div className="flex justify-between text-[#ffcc00]/70">
              <span>AUDIO TIER:</span>
              <span className="font-bold text-[#ffcc00]">24 ALARM COUNTDOWN ESCALATION</span>
            </div>
          </div>
        </section>
      </div>

      {/* Footer CTU Terminal Telemetry */}
      <footer className="border-t border-[#ffcc00]/30 pt-2 flex flex-wrap items-center justify-between text-[11px] text-[#ffcc00]/60 tracking-wider">
        <span>CTU TACTICAL DIRECTIVE 24-B // DEFENSE PROTOCOL ACTIVE</span>
        <span>TERMINAL ID: CTU-BKK-01 // ALL TRANSMISSIONS RECORDED</span>
      </footer>

      {/* Unified Samsung One UI Drum Time Picker Modal */}
      {pickerOpen && (
        <SamsungTimePicker
          mode={pickerMode}
          initialHours={pickerInitial.hours}
          initialMinutes={pickerInitial.minutes}
          initialSeconds={pickerInitial.seconds}
          onSave={handlePickerSave}
          onCancel={() => {
            setPickerOpen(false);
            setEditingItemId(null);
          }}
        />
      )}

      {/* Fullscreen Final 10-Second Takeover Overlay */}
      {countdownActive && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4">
          <div className="border-4 border-[#ffcc00] bg-black p-8 md:p-12 text-center max-w-xl w-full shadow-[0_0_50px_rgba(255,204,0,0.5)]">
            <div className="text-red-500 font-black tracking-widest text-sm md:text-lg mb-2 animate-pulse">
              CRITICAL TIMEOUT ESCALATION // {countdownLabel}
            </div>
            <div
              className={`text-7xl sm:text-8xl md:text-9xl font-black tabular-nums my-4 tracking-tighter ${
                countdownRemaining <= 3
                  ? "text-red-600 animate-bounce glow"
                  : "text-[#ffcc00] animate-pulse glow"
              }`}
            >
              00:00:{countdownRemaining.toString().padStart(2, "0")}
            </div>
            <div className="text-xs text-[#ffcc00]/70 tracking-widest mb-6">
              REACHING ZERO IMPACT // MULTI-TIER AUDIO MATRIX ENGAGED
            </div>
            <button
              onClick={() => {
                CTUAudio.stopAll();
                setCountdownActive(false);
              }}
              className="px-6 py-2 bg-red-600 text-black font-black text-sm tracking-widest hover:bg-red-500 transition"
            >
              ABORT COUNTDOWN
            </button>
          </div>
        </div>
      )}

      {/* Fullscreen Times-Up / Crisis Strike Modal */}
      {crisisTimesUp && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4">
          <div className="border-4 border-red-600 bg-black p-8 md:p-12 text-center max-w-xl w-full shadow-[0_0_60px_rgba(255,0,0,0.6)]">
            <div className="text-red-500 font-black tracking-widest text-xl md:text-2xl mb-2 animate-pulse">
              OPERATION TIMEOUT AT ZERO
            </div>
            <div className="text-5xl sm:text-6xl md:text-7xl font-black text-red-600 my-4 tracking-tighter glow animate-pulse">
              00:00:00
            </div>
            <div className="text-sm text-[#ffcc00] tracking-widest mb-6 font-bold">
              CRISIS STRIKE CONFIRMED // {countdownLabel || activeTimer.label}
            </div>
            <button
              onClick={handleDismissCrisis}
              className="px-8 py-3 bg-[#ffcc00] text-black font-black text-base tracking-widest hover:bg-[#ffe066] transition shadow-[0_0_20px_rgba(255,204,0,0.5)]"
            >
              RESET OPERATION & STANDBY
            </button>
          </div>
        </div>
      )}

      {/* Opening Transmission Video Modal */}
      {openingOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
          <div className="relative w-full max-w-3xl border-2 border-[#ffcc00] bg-black p-2 flex flex-col gap-2 shadow-[0_0_30px_rgba(255,204,0,0.3)]">
            <div className="flex items-center justify-between border-b border-[#ffcc00]/30 pb-1.5 px-2">
              <span className="text-xs font-bold tracking-widest text-[#ffcc00]">
                CTU TRANSMISSION PROTOCOL // INCOMING STREAM
              </span>
              <button
                onClick={handleCloseOpening}
                className="text-[#ffcc00] hover:text-white font-bold text-sm px-2"
              >
                ✕
              </button>
            </div>
            <div className="w-full aspect-video bg-black flex items-center justify-center overflow-hidden">
              <video
                src="/24 Opening.mp4"
                autoPlay
                controls
                playsInline
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* Ending Credits Modal (Tactical 3x2 Watercolor Surveillance Matrix / Original Video) */}
      {creditsOpen && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-2 md:p-6">
          <div className="relative w-full max-w-4xl h-[85vh] border-2 border-[#ffcc00] bg-black flex flex-col shadow-[0_0_40px_rgba(255,204,0,0.3)] overflow-hidden">
            {/* Top Command Bar */}
            <div className="flex items-center justify-between border-b border-[#ffcc00]/30 p-2 bg-black/80 z-20">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-[#ffcc00] animate-ping" />
                <span className="text-xs font-bold tracking-widest text-[#ffcc00]">
                  CTU FIELD AGENT ARCHIVE // CLOSING CREDITS
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreditsMusicToggle}
                  className="text-[10px] md:text-xs font-bold border border-[#ffcc00] px-2.5 py-1 hover:bg-[#ffcc00]/20 transition"
                >
                  {creditsMusic ? "MUSIC: ON" : "MUSIC: OFF"}
                </button>
                <button
                  onClick={() =>
                    handleCreditsModeChange(
                      creditsMode === "watercolor" ? "video" : "watercolor"
                    )
                  }
                  className="text-[10px] md:text-xs font-bold border border-[#ffcc00] px-2.5 py-1 hover:bg-[#ffcc00]/20 transition"
                >
                  VIEW: {creditsMode.toUpperCase()}
                </button>
                <button
                  onClick={handleCloseCredits}
                  className="text-[#ffcc00] hover:text-white font-bold text-base px-2"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Viewport: Video or 3x2 Watercolor Surveillance Matrix with Rotating Archive Images */}
            <div className="relative flex-grow overflow-hidden bg-black flex items-center justify-center">
              {creditsMode === "video" ? (
                <div className="w-full h-full flex items-center justify-center bg-black">
                  <video
                    src="/24 Closing.mp4"
                    autoPlay
                    controls
                    playsInline
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                <>
                  {/* Tactical 3x2 Watercolor Surveillance Matrix (Cycles through all 32 images) */}
                  <div className="absolute inset-0 grid grid-cols-3 grid-rows-2 gap-1 opacity-70 p-1 pointer-events-none">
                    {Array.from({ length: 6 }).map((_, idx) => {
                      const imgIdx = (creditsImageOffset + idx) % WATERCOLOR_IMAGES.length;
                      const imgSrc = WATERCOLOR_IMAGES[imgIdx];
                      return (
                        <div
                          key={idx}
                          className="relative w-full h-full overflow-hidden border border-[#ffcc00]/20 bg-black"
                        >
                          <img
                            src={imgSrc}
                            alt={`CTU Archive CAM-0${idx + 1}`}
                            className="w-full h-full object-cover ken watercolor transition-opacity duration-1000"
                          />
                          <div className="absolute top-1 left-1 bg-black/80 text-[8px] font-bold text-[#ffcc00] px-1 tracking-widest">
                            CAM-0{idx + 1}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Dark Vignette Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-b from-black via-black/40 to-black pointer-events-none" />

                  {/* Rolling Amber Credits Typography */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 pointer-events-none">
                    <div
                      className="space-y-6"
                      style={{ animation: "creditsRoll 62s linear infinite" }}
                    >
                      <div className="mb-8">
                        <div className="text-4xl md:text-6xl font-black tracking-tighter text-[#ffcc00] glow">
                          24
                        </div>
                        <div className="text-xs md:text-sm font-bold tracking-widest text-[#ffcc00]/80 mt-1">
                          COUNTER TERRORIST UNIT
                        </div>
                      </div>

                      {CREDITS_NAMES.map((c, i) => (
                        <div key={i} className="space-y-1">
                          <div className="text-[10px] md:text-xs font-bold tracking-widest text-[#ffcc00]/60">
                            {c.role}
                          </div>
                          <div className="text-xs md:text-base font-black tracking-wider text-[#ffcc00]">
                            {c.name}
                          </div>
                        </div>
                      ))}

                      <div className="pt-8 text-[11px] font-bold tracking-widest text-[#ffcc00]/60">
                        ALL EVENTS OCCUR IN REAL TIME
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
