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

interface StoredDeadline {
  id: string;
  label: string;
  targetEpochMs: number;
  type: "timer" | "alarm";
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
  const [now, setNow] = useState<Date>(() => new Date(0));
  const [colonVisible, setColonVisible] = useState(true);

  // User Settings State (Hydrated & Persisted)
  const [zeroSound, setZeroSound] = useState<ZeroSoundType>("voice");
  const [volume, setVolume] = useState(0.85);
  const [creditsMusic, setCreditsMusic] = useState(true);
  const [creditsMode, setCreditsMode] = useState<"watercolor" | "video">("watercolor");

  // Operational Multi-Timers & Multi-Alarms
  const [timers, setTimers] = useState<OperationalTimer[]>(INITIAL_TIMERS);
  const [alarms, setAlarms] = useState<OperationalAlarm[]>(INITIAL_ALARMS);
  const [activeTimerId, setActiveTimerId] = useState<string>("timer-1");

  // OS Background Notifications State
  const [osAlertStatus, setOsAlertStatus] = useState<NotificationPermission>("default");

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

  const audioUnlockedRef = useRef(false);

  // Helper: Post alert payload to Service Worker
  const postToWorker = useCallback((msg: unknown) => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.controller?.postMessage(msg);
    }
  }, []);

  // Helper: Persist deadline to localStorage
  const saveDeadline = useCallback((deadline: StoredDeadline) => {
    try {
      const raw = localStorage.getItem("ctu_active_deadlines");
      const list: StoredDeadline[] = raw ? JSON.parse(raw) : [];
      const filtered = list.filter((d) => d.id !== deadline.id);
      filtered.push(deadline);
      localStorage.setItem("ctu_active_deadlines", JSON.stringify(filtered));
    } catch {
      // Storage unavailable
    }
  }, []);

  // Helper: Remove deadline from localStorage
  const removeDeadline = useCallback((id: string) => {
    try {
      const raw = localStorage.getItem("ctu_active_deadlines");
      if (!raw) return;
      const list: StoredDeadline[] = JSON.parse(raw);
      localStorage.setItem("ctu_active_deadlines", JSON.stringify(list.filter((d) => d.id !== id)));
    } catch {
      // Storage unavailable
    }
  }, []);

  // Check for expired deadlines (Catch-up when tab wakes up or reopens)
  const checkWakeCatchup = useCallback(() => {
    try {
      const raw = localStorage.getItem("ctu_active_deadlines");
      if (!raw) return;
      const list: StoredDeadline[] = JSON.parse(raw);
      const nowMs = Date.now();
      const expired = list.find((d) => d.targetEpochMs <= nowMs);

      if (expired) {
        removeDeadline(expired.id);
        setCountdownActive(false);
        setCountdownLabel(expired.label);
        setCrisisTimesUp(true);
        CTUAudio.playZeroSound(zeroSound);
      }
    } catch {
      // Ignore
    }
  }, [removeDeadline, zeroSound]);

  // Request Notification permission
  const handleToggleOsAlerts = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    try {
      const perm = await Notification.requestPermission();
      setOsAlertStatus(perm);
      if (perm === "granted" && "vibrate" in navigator) {
        navigator.vibrate([150, 50, 150]);
      }
    } catch {
      setOsAlertStatus("denied");
    }
  };

  // Schedule Timer Alert in Service Worker
  const scheduleTimerBackground = useCallback(
    (timer: OperationalTimer) => {
      if (timer.remainingSec <= 0) return;
      const targetEpochMs = Date.now() + timer.remainingSec * 1000;
      saveDeadline({ id: timer.id, label: timer.label, targetEpochMs, type: "timer" });
      postToWorker({
        type: "SCHEDULE_ALERT",
        id: timer.id,
        title: `[CTU CRISIS ALERT] ${timer.label.toUpperCase()} AT ZERO`,
        body: "Operational time expired. Tactical override active.",
        delayMs: timer.remainingSec * 1000,
      });
    },
    [postToWorker, saveDeadline]
  );

  // Cancel Timer Alert in Service Worker
  const cancelTimerBackground = useCallback(
    (timerId: string) => {
      removeDeadline(timerId);
      postToWorker({ type: "CANCEL_ALERT", id: timerId });
    },
    [postToWorker, removeDeadline]
  );

  // Schedule Alarm Alert in Service Worker
  const scheduleAlarmBackground = useCallback(
    (alarm: OperationalAlarm) => {
      const cur = new Date();
      const target = new Date();
      target.setHours(alarm.hour, alarm.minute, 0, 0);
      if (target.getTime() <= cur.getTime()) {
        target.setDate(target.getDate() + 1);
      }
      const delayMs = target.getTime() - cur.getTime();

      saveDeadline({ id: alarm.id, label: alarm.label, targetEpochMs: target.getTime(), type: "alarm" });
      postToWorker({
        type: "SCHEDULE_ALERT",
        id: alarm.id,
        title: `[CTU DAILY ALARM] ${alarm.label.toUpperCase()}`,
        body: `Alarm time: ${String(alarm.hour).padStart(2, "0")}:${String(alarm.minute).padStart(2, "0")}.`,
        delayMs,
      });
    },
    [postToWorker, saveDeadline]
  );

  // Hydrate user settings, timers, alarms, and check catch-up
  useEffect(() => {
    try {
      if (typeof window !== "undefined" && "Notification" in window) {
        setOsAlertStatus(Notification.permission);
      }

      // Register SW if available
      if (typeof window !== "undefined" && "serviceWorker" in navigator) {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      }

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
      if (savedSound && ZERO_SOUND_LABELS[savedSound]) setZeroSound(savedSound);

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

      // Check if any deadline expired while closed
      checkWakeCatchup();
    } catch {
      // Ignore
    }
  }, [checkWakeCatchup]);

  // Wake listener on visibilitychange
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        checkWakeCatchup();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [checkWakeCatchup]);

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

  // Primary Operations Controls with Background Sync
  const handleStartPrimary = () => {
    unlockAudio();
    scheduleTimerBackground(activeTimer);
    saveTimers(
      timers.map((t) =>
        t.id === activeTimer.id ? { ...t, running: true, timesUp: false, status: "EXECUTING" } : t
      )
    );
  };

  const handlePausePrimary = () => {
    cancelTimerBackground(activeTimer.id);
    saveTimers(
      timers.map((t) =>
        t.id === activeTimer.id ? { ...t, running: false, status: "HOLD" } : t
      )
    );
  };

  const handleResetPrimary = () => {
    CTUAudio.stopAll();
    cancelTimerBackground(activeTimer.id);
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
    cancelTimerBackground(activeTimer.id);
    setCountdownActive(false);
    setCrisisTimesUp(false);
    const updatedTimer = {
      ...activeTimer,
      durationSec: presetDuration,
      remainingSec: presetDuration,
      label: presetLabel,
      running: true,
      timesUp: false,
      status: "EXECUTING",
    };
    scheduleTimerBackground(updatedTimer);
    saveTimers(timers.map((t) => (t.id === activeTimer.id ? updatedTimer : t)));
  };

  // Alarm Arming Toggle with Background Sync
  const handleToggleAlarm = (alarmId: string) => {
    unlockAudio();
    const updated = alarms.map((a) => {
      if (a.id === alarmId) {
        const nextArmed = !a.armed;
        if (nextArmed) {
          scheduleAlarmBackground({ ...a, armed: true });
        } else {
          cancelTimerBackground(a.id);
        }
        return { ...a, armed: nextArmed };
      }
      return a;
    });
    saveAlarms(updated);
  };

  // Delete Timer Handler
  const handleDeleteTimer = (id: string) => {
    if (timers.length <= 1) return;
    cancelTimerBackground(id);
    const next = timers.filter((t) => t.id !== id);
    saveTimers(next);
    if (activeTimerId === id) setActiveTimerId(next[0].id);
  };

  // Delete Alarm Handler
  const handleDeleteAlarm = (id: string) => {
    if (alarms.length <= 1) return;
    cancelTimerBackground(id);
    saveAlarms(alarms.filter((a) => a.id !== id));
  };

  // Add New Timer Modal Opener
  const handleOpenAddTimer = () => {
    unlockAudio();
    setPickerMode("timer");
    setEditingItemId(null);
    setPickerInitial({ hours: 0, minutes: 25, seconds: 0, totalSeconds: 25 * 60 });
    setPickerOpen(true);
  };

  // Add New Alarm Modal Opener
  const handleOpenAddAlarm = () => {
    unlockAudio();
    setPickerMode("alarm");
    setEditingItemId(null);
    setPickerInitial({ hours: 7, minutes: 0, seconds: 0, totalSeconds: 7 * 3600 });
    setPickerOpen(true);
  };

  // Edit Existing Timer
  const handleEditTimer = (timer: OperationalTimer) => {
    unlockAudio();
    setPickerMode("timer");
    setEditingItemId(timer.id);
    const { h, m, s } = formatTime(timer.durationSec);
    setPickerInitial({
      hours: parseInt(h, 10),
      minutes: parseInt(m, 10),
      seconds: parseInt(s, 10),
      totalSeconds: timer.durationSec,
    });
    setPickerOpen(true);
  };

  // Edit Existing Alarm
  const handleEditAlarm = (alarm: OperationalAlarm) => {
    unlockAudio();
    setPickerMode("alarm");
    setEditingItemId(alarm.id);
    setPickerInitial({
      hours: alarm.hour,
      minutes: alarm.minute,
      seconds: 0,
      totalSeconds: alarm.hour * 3600 + alarm.minute * 60,
    });
    setPickerOpen(true);
  };

  // Save Samsung Picker Value (Add or Edit)
  const handleSavePicker = (values: SamsungTimePickerValues) => {
    setPickerOpen(false);
    if (pickerMode === "timer") {
      const durationSec = values.totalSeconds || values.hours * 3600 + values.minutes * 60 + values.seconds;
      if (durationSec <= 0) return;

      if (editingItemId) {
        cancelTimerBackground(editingItemId);
        saveTimers(
          timers.map((t) =>
            t.id === editingItemId
              ? { ...t, durationSec, remainingSec: durationSec, running: false, status: "STANDBY" }
              : t
          )
        );
      } else {
        const newTimer: OperationalTimer = {
          id: `timer-${Date.now()}`,
          label: `OPERATION ${timers.length + 1}`,
          durationSec,
          remainingSec: durationSec,
          running: false,
          timesUp: false,
          status: "READY",
        };
        saveTimers([...timers, newTimer]);
        setActiveTimerId(newTimer.id);
      }
    } else {
      if (editingItemId) {
        const updatedAlarm = alarms.map((a) =>
          a.id === editingItemId ? { ...a, hour: values.hours, minute: values.minutes } : a
        );
        saveAlarms(updatedAlarm);
        const target = updatedAlarm.find((a) => a.id === editingItemId);
        if (target && target.armed) scheduleAlarmBackground(target);
      } else {
        const newAlarm: OperationalAlarm = {
          id: `alarm-${Date.now()}`,
          label: `ALERT ${alarms.length + 1}`,
          hour: values.hours,
          minute: values.minutes,
          armed: true,
        };
        saveAlarms([...alarms, newAlarm]);
        scheduleAlarmBackground(newAlarm);
      }
    }
    setEditingItemId(null);
  };

  // Dismiss Crisis Times-Up Screen
  const handleDismissCrisis = () => {
    CTUAudio.stopAll();
    setCrisisTimesUp(false);
    setCountdownActive(false);
    handleResetPrimary();
  };

  // Transmission Video Modal Controls
  const handleOpenOpening = () => {
    unlockAudio();
    setOpeningOpen(true);
  };

  const handleCloseOpening = () => setOpeningOpen(false);

  const handleOpenCredits = () => {
    unlockAudio();
    setCreditsOpen(true);
    if (creditsMusic) CTUAudio.startCreditsAudio();
  };

  const handleCloseCredits = () => {
    CTUAudio.stopCreditsAudio();
    setCreditsOpen(false);
  };

  const handleCreditsMusicToggle = () => {
    setCreditsMusic((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("ctu_credits_music", next.toString());
      } catch {
        // Ignore
      }
      if (next) CTUAudio.startCreditsAudio();
      else CTUAudio.stopCreditsAudio();
      return next;
    });
  };

  const handleCreditsModeChange = (mode: "watercolor" | "video") => {
    setCreditsMode(mode);
    try {
      localStorage.setItem("ctu_credits_mode", mode);
    } catch {
      // Ignore
    }
  };

  return (
    <main
      className="min-h-screen bg-black text-[#ffcc00] font-mono select-none p-2 sm:p-4 md:p-6 flex flex-col gap-4 overflow-x-hidden"
      onClick={unlockAudio}
    >
      {/* Top Banner / System Status Header */}
      <header className="border-2 border-[#ffcc00] bg-black/90 p-3 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-[0_0_15px_rgba(255,204,0,0.2)]">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-[#ffcc00] animate-pulse shadow-[0_0_8px_#ffcc00]" />
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-widest text-[#ffcc00] glow">
              CTU // TACTICAL OPERATIONS COMMAND
            </h1>
            <p className="text-[10px] sm:text-xs text-[#ffcc00]/70 tracking-wider">
              LOS ANGELES HEADQUARTERS • BANGKOK OPERATIONAL NODE • PROTOCOL 24
            </p>
          </div>
        </div>

        {/* Global Action & Surveillance Triggers */}
        <div className="flex flex-wrap items-center gap-2">
          {/* OS Notification Link Button */}
          <button
            onClick={handleToggleOsAlerts}
            className={`text-xs font-bold border px-3 py-1.5 transition flex items-center gap-1.5 ${
              osAlertStatus === "granted"
                ? "border-[#ffcc00] text-[#ffcc00] bg-[#ffcc00]/10 shadow-[0_0_10px_rgba(255,204,0,0.3)]"
                : osAlertStatus === "denied"
                ? "border-red-600 text-red-500 bg-red-950/20"
                : "border-[#ffcc00]/60 text-[#ffcc00]/80 hover:bg-[#ffcc00]/20 animate-pulse"
            }`}
            title="Link OS Notifications for background alerts when the app is closed"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                osAlertStatus === "granted" ? "bg-[#ffcc00]" : osAlertStatus === "denied" ? "bg-red-500" : "bg-[#ffcc00] animate-ping"
              }`}
            />
            {osAlertStatus === "granted"
              ? "OS ALERTS: ARMED"
              : osAlertStatus === "denied"
              ? "OS ALERTS: BLOCKED"
              : "LINK OS ALERTS"}
          </button>

          <button
            onClick={handleOpenOpening}
            className="text-xs font-bold border border-[#ffcc00] px-3 py-1.5 hover:bg-[#ffcc00]/20 transition flex items-center gap-1.5"
          >
            <span className="w-1.5 h-1.5 bg-[#ffcc00]" />
            OPENING FEED
          </button>
          <button
            onClick={handleOpenCredits}
            className="text-xs font-bold border border-[#ffcc00] px-3 py-1.5 hover:bg-[#ffcc00]/20 transition flex items-center gap-1.5"
          >
            <span className="w-1.5 h-1.5 bg-[#ffcc00]" />
            CLOSING CREDITS
          </button>
        </div>
      </header>

      {/* Moving World Time Ticker (Chronological West to East, 120s smooth crawl) */}
      <section className="relative w-full border border-[#ffcc00]/40 bg-black overflow-hidden py-1.5 px-2">
        <div className="world-ticker-wrap flex items-center">
          <div className="world-ticker-track flex items-center gap-8 whitespace-nowrap">
            {sortedTheaters.map((t, idx) => (
              <div
                key={`t1-${idx}`}
                className={`flex items-center gap-2 text-xs tracking-widest ${
                  t.isHome ? "text-[#ffcc00] font-black glow bg-[#ffcc00]/10 px-2 py-0.5 border border-[#ffcc00]/40" : "text-[#ffcc00]/80"
                }`}
              >
                <span className="opacity-60">{t.code}:</span>
                <span className="font-bold">{t.city}</span>
                <span className="tabular-nums font-mono">{formatTheaterTime(t.zone)}</span>
              </div>
            ))}
            {/* Seamless duplicate loop */}
            {sortedTheaters.map((t, idx) => (
              <div
                key={`t2-${idx}`}
                className={`flex items-center gap-2 text-xs tracking-widest ${
                  t.isHome ? "text-[#ffcc00] font-black glow bg-[#ffcc00]/10 px-2 py-0.5 border border-[#ffcc00]/40" : "text-[#ffcc00]/80"
                }`}
              >
                <span className="opacity-60">{t.code}:</span>
                <span className="font-bold">{t.city}</span>
                <span className="tabular-nums font-mono">{formatTheaterTime(t.zone)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Primary Operations & Unified Live Mission Clock (Responsive Stack / Side-by-Side) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Bangkok Operational Mission Clock */}
        <section className="border-2 border-[#ffcc00] bg-black p-4 flex flex-col justify-between shadow-[0_0_20px_rgba(255,204,0,0.15)]">
          <div className="flex items-center justify-between border-b border-[#ffcc00]/30 pb-2 mb-3">
            <span className="text-xs font-bold tracking-widest text-[#ffcc00]/80">
              STATION TIME // BANGKOK THEATER (UTC+7)
            </span>
            <span className="text-xs font-mono text-[#ffcc00]/70">ZULU: {zuluTime}</span>
          </div>

          <div className="flex flex-col items-center justify-center my-4 py-2">
            <div className="text-6xl sm:text-7xl md:text-8xl font-black text-[#ffcc00] tracking-tighter tabular-nums glow flex items-center">
              <span>{bangkokTime.h}</span>
              <span className={`mx-1 text-[#ffcc00]/80 ${colonVisible ? "opacity-100" : "opacity-20"}`}>:</span>
              <span>{bangkokTime.m}</span>
              <span className={`mx-1 text-[#ffcc00]/80 ${colonVisible ? "opacity-100" : "opacity-20"}`}>:</span>
              <span>{bangkokTime.s}</span>
            </div>
            <div className="mt-2 text-xs tracking-widest text-[#ffcc00]/60 font-semibold">
              ALL EVENTS OCCUR IN REAL TIME
            </div>
          </div>

          {/* Quick Presets Bar */}
          <div className="border-t border-[#ffcc00]/30 pt-3">
            <div className="text-[10px] tracking-widest text-[#ffcc00]/60 mb-2 font-bold uppercase">
              QUICK-ARM PRESETS (TOUCH TO DEPLOY):
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1.5">
              {CTU_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleApplyPreset(p.durationSec, p.label)}
                  className="text-[11px] font-bold border border-[#ffcc00]/60 p-1.5 hover:bg-[#ffcc00]/20 hover:border-[#ffcc00] transition text-center truncate"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Right: Primary Active Operation Viewport */}
        <section className="border-2 border-[#ffcc00] bg-black p-4 flex flex-col justify-between shadow-[0_0_20px_rgba(255,204,0,0.15)]">
          <div className="flex items-center justify-between border-b border-[#ffcc00]/30 pb-2 mb-3">
            <div className="flex items-center gap-2 truncate">
              <span className="w-2 h-2 bg-[#ffcc00] animate-ping" />
              <span className="text-xs font-black tracking-widest text-[#ffcc00] truncate">
                {activeTimer.label}
              </span>
            </div>
            <span
              className={`text-[10px] font-bold tracking-widest px-2 py-0.5 border ${
                activeTimer.running
                  ? "border-[#ffcc00] text-[#ffcc00] bg-[#ffcc00]/10"
                  : activeTimer.timesUp
                  ? "border-red-600 text-red-500 bg-red-950/20"
                  : "border-[#ffcc00]/40 text-[#ffcc00]/60"
              }`}
            >
              {activeTimer.status}
            </span>
          </div>

          {/* Primary Big Digits */}
          <div
            onClick={() => handleEditTimer(activeTimer)}
            className="flex flex-col items-center justify-center my-4 py-2 cursor-pointer group"
            title="Tap to adjust operational duration"
          >
            <div className="text-6xl sm:text-7xl md:text-8xl font-black text-[#ffcc00] tracking-tighter tabular-nums glow group-hover:scale-[1.02] transition-transform">
              {primaryDigits.h}:{primaryDigits.m}:{primaryDigits.s}
            </div>
            <div className="mt-2 text-[10px] tracking-widest text-[#ffcc00]/60 group-hover:text-[#ffcc00] transition">
              TAP DIGITS TO MODIFY TIME (SAMSUNG HH:MM:SS)
            </div>
          </div>

          {/* Execution Command Bar */}
          <div className="border-t border-[#ffcc00]/30 pt-3 flex items-center justify-center gap-2 sm:gap-4">
            {!activeTimer.running ? (
              <button
                onClick={handleStartPrimary}
                className="flex-1 py-2 sm:py-2.5 bg-[#ffcc00] text-black font-black text-sm tracking-widest hover:bg-[#ffe066] transition shadow-[0_0_15px_rgba(255,204,0,0.4)]"
              >
                EXECUTE OPERATION
              </button>
            ) : (
              <button
                onClick={handlePausePrimary}
                className="flex-1 py-2 sm:py-2.5 border-2 border-[#ffcc00] bg-black text-[#ffcc00] font-black text-sm tracking-widest hover:bg-[#ffcc00]/20 transition"
              >
                HOLD / PAUSE
              </button>
            )}

            <button
              onClick={handleResetPrimary}
              className="px-4 py-2 sm:py-2.5 border border-[#ffcc00]/60 text-[#ffcc00]/80 font-bold text-xs tracking-widest hover:bg-red-900/30 hover:border-red-500 hover:text-red-400 transition"
            >
              RESET
            </button>
          </div>
        </section>
      </div>

      {/* Multi-Timer & Multi-Alarm Queues */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Multi-Timers Console */}
        <section className="border border-[#ffcc00]/60 bg-black p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between border-b border-[#ffcc00]/30 pb-2">
            <span className="text-xs font-bold tracking-widest text-[#ffcc00]">
              OPERATION QUEUE ({timers.length} ACTIVE)
            </span>
            <button
              onClick={handleOpenAddTimer}
              className="text-[11px] font-bold border border-[#ffcc00] px-2 py-0.5 hover:bg-[#ffcc00]/20 transition"
            >
              + ADD OPERATION
            </button>
          </div>

          <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
            {timers.map((t) => {
              const dig = formatTime(t.remainingSec);
              const isFocused = t.id === activeTimerId;
              return (
                <div
                  key={t.id}
                  onClick={() => setActiveTimerId(t.id)}
                  className={`p-2 border cursor-pointer flex items-center justify-between transition ${
                    isFocused
                      ? "border-[#ffcc00] bg-[#ffcc00]/10 shadow-[0_0_10px_rgba(255,204,0,0.2)]"
                      : "border-[#ffcc00]/30 bg-black hover:border-[#ffcc00]/60"
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="text-xs font-bold tracking-wider">{t.label}</span>
                    <span className="text-[10px] text-[#ffcc00]/60">{t.status}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-base font-black tabular-nums tracking-tight">
                      {dig.h}:{dig.m}:{dig.s}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTimer(t.id);
                      }}
                      className="text-xs text-red-500 hover:text-red-400 font-bold px-1"
                      title="Delete operation"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Multi-Alarms Console */}
        <section className="border border-[#ffcc00]/60 bg-black p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between border-b border-[#ffcc00]/30 pb-2">
            <span className="text-xs font-bold tracking-widest text-[#ffcc00]">
              DAILY ALARMS ({alarms.length} ARMED)
            </span>
            <button
              onClick={handleOpenAddAlarm}
              className="text-[11px] font-bold border border-[#ffcc00] px-2 py-0.5 hover:bg-[#ffcc00]/20 transition"
            >
              + ADD ALARM
            </button>
          </div>

          <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
            {alarms.map((a) => {
              const timeStr = `${a.hour.toString().padStart(2, "0")}:${a.minute.toString().padStart(2, "0")}`;
              return (
                <div
                  key={a.id}
                  onClick={() => handleEditAlarm(a)}
                  className="p-2 border border-[#ffcc00]/30 bg-black flex items-center justify-between hover:border-[#ffcc00]/60 transition cursor-pointer"
                >
                  <div className="flex flex-col">
                    <span className="text-xs font-bold tracking-wider">{a.label}</span>
                    <span className="text-[10px] text-[#ffcc00]/60">BANGKOK (UTC+7)</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-base font-black tabular-nums tracking-tight">{timeStr}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleAlarm(a.id);
                      }}
                      className={`text-[10px] font-bold px-2 py-0.5 border ${
                        a.armed
                          ? "border-[#ffcc00] text-[#ffcc00] bg-[#ffcc00]/20"
                          : "border-gray-700 text-gray-500 bg-transparent"
                      }`}
                    >
                      {a.armed ? "ARMED" : "OFF"}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteAlarm(a.id);
                      }}
                      className="text-xs text-red-500 hover:text-red-400 font-bold px-1"
                      title="Delete alarm"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Audio Matrix & Tactical Settings */}
      <footer className="border border-[#ffcc00]/40 bg-black p-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[#ffcc00]/70 font-bold">AT ZERO SOUND:</span>
          <select
            value={zeroSound}
            onChange={(e) => handleZeroSoundChange(e.target.value as ZeroSoundType)}
            className="bg-black border border-[#ffcc00] text-[#ffcc00] px-2 py-1 text-xs font-mono font-bold"
          >
            {Object.entries(ZERO_SOUND_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-[#ffcc00]/70 font-bold">VOL:</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
            className="w-24 sm:w-32 accent-[#ffcc00]"
          />
          <span className="font-bold tabular-nums">{Math.round(volume * 100)}%</span>
        </div>
      </footer>

      {/* Samsung Galaxy One UI-Style Drum Time Picker Modal */}
      {pickerOpen && (
        <SamsungTimePicker
          mode={pickerMode}
          initialHours={pickerInitial.hours}
          initialMinutes={pickerInitial.minutes}
          initialSeconds={pickerInitial.seconds}
          onSave={handleSavePicker}
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

      {/* Ending Credits Modal */}
      {creditsOpen && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-2 md:p-6">
          <div className="relative w-full max-w-4xl h-[85vh] border-2 border-[#ffcc00] bg-black flex flex-col shadow-[0_0_40px_rgba(255,204,0,0.3)] overflow-hidden">
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
                    handleCreditsModeChange(creditsMode === "watercolor" ? "video" : "watercolor")
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

                  <div className="absolute inset-0 bg-gradient-to-b from-black via-black/40 to-black pointer-events-none" />

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
