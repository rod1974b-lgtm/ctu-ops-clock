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
  "/24_accurate_watercolors_final/01_jack_desk_briefing.webp",
  "/24_accurate_watercolors_final/02_jack_phone_dark_room.webp",
  "/24_accurate_watercolors_final/03_jack_crouched_car_night.webp",
  "/24_accurate_watercolors_final/04_jack_aiming_flashlight_corridor.webp",
  "/24_accurate_watercolors_final/05_jack_hostage_industrial.webp",
  "/24_accurate_watercolors_final/06_jack_profile_amber_display.webp",
  "/24_accurate_watercolors_final/07_chloe_headset_monitors.webp",
  "/24_accurate_watercolors_final/08_chloe_concerned_amber_terminal.webp",
  "/24_accurate_watercolors_final/09_george_mason_office_tense.webp",
  "/24_accurate_watercolors_final/10_mason_walkway_above_floor.webp",
  "/24_accurate_watercolors_final/11_bill_buchanan_command_screens.webp",
  "/24_accurate_watercolors_final/12_tony_almeida_surveillance_split.webp",
  "/24_accurate_watercolors_final/13_kim_bauer_threat_level.webp",
  "/24_accurate_watercolors_final/14_david_palmer_oval_office.webp",
  "/24_accurate_watercolors_final/15_michelle_dessler_comms_node.webp",
  "/24_accurate_watercolors_final/16_chloe_encrypted_decryption.webp",
  "/24_accurate_watercolors_final/17_jack_interrogation_harsh_light.webp",
  "/24_accurate_watercolors_final/18_jack_rooftop_sniper_los_angeles.webp",
  "/24_accurate_watercolors_final/19_ctu_situation_room_crisis.webp",
  "/24_accurate_watercolors_final/20_tactical_van_los_angeles_freeway.webp",
  "/24_accurate_watercolors_final/21_warehouse_breach_smoke.webp",
  "/24_accurate_watercolors_final/22_jack_tactical_vest_shotgun.webp",
  "/24_accurate_watercolors_final/23_palmer_press_room_lectern.webp",
  "/24_accurate_watercolors_final/24_satellite_downlink_dish_desert.webp",
  "/24_accurate_watercolors_final/25_substation_sabotage_sparks.webp",
  "/24_accurate_watercolors_final/26_jack_running_alley_motion.webp",
  "/24_accurate_watercolors_final/27_heli_pad_chopper_dust.webp",
  "/24_accurate_watercolors_final/28_underground_bunker_vault_door.webp",
  "/24_accurate_watercolors_final/29_jack_handcuffed_holding_cell.webp",
  "/24_accurate_watercolors_final/30_chloe_cell_phone_patch.webp",
  "/24_accurate_watercolors_final/31_jack_silhouette_sunset_fence.webp",
  "/24_accurate_watercolors_final/32_silent_clock_blackout_memorial.webp",
];

const CREDITS_NAMES = [
  { role: "EXECUTIVE PRODUCER", name: "JOEL SURNOW & ROBERT COCHRAN" },
  { role: "EXECUTIVE PRODUCER", name: "HOWARD GORDON" },
  { role: "EXECUTIVE PRODUCER", name: "BRIAN GRAZER & TONY KRANTZ" },
  { role: "CO-EXECUTIVE PRODUCER", name: "STEPHEN KRONISH" },
  { role: "PRODUCED BY", name: "MICHAEL LOEFFELMACHER" },
  { role: "DIRECTED BY", name: "JON CASSER" },
  { role: "MUSIC COMPOSED BY", name: "SEAN CALLERY" },
  { role: "DIRECTOR OF PHOTOGRAPHY", name: "RODNEY CHARTERS, A.S.C., C.S.C." },
  { role: "PRODUCTION DESIGNER", name: "JOSEPH A. HODGES" },
  { role: "EDITOR", name: "CHRIS WILLINGHAM, A.C.E." },
  { role: "STARRING", name: "KIEFER SUTHERLAND AS JACK BAUER" },
  { role: "SPECIAL AGENT IN CHARGE", name: "XANDER BERKELEY AS GEORGE MASON" },
  { role: "SENIOR TACTICAL ANALYST", name: "CARLOS BERNARD AS TONY ALMEIDA" },
  { role: "TACTICAL INTEL ANALYST", name: "MARY LYNN RAJSKUB AS CHLOE O'BRIAN" },
  { role: "DIRECTOR OF FIELD OPERATIONS", name: "JAMES MORRISON AS BILL BUCHANAN" },
  { role: "INTERNET & COMMS DIR.", name: "REIKO AYLESWORTH AS MICHELLE DESSLER" },
  { role: "PRESIDENT OF THE UNITED STATES", name: "DENNIS HAYSBERT AS DAVID PALMER" },
  { role: "CTU LOS ANGELES DIVISION", name: "FIELD OPERATIONAL COMMAND HQ" },
];

function formatTime(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  return {
    hours: String(hrs).padStart(2, "0"),
    minutes: String(mins).padStart(2, "0"),
    seconds: String(secs).padStart(2, "0"),
  };
}

export function CTUTerminalV74() {
  const [now, setNow] = useState<Date>(new Date());
  const [is24Hour, setIs24Hour] = useState(true);
  const [stealthOps, setStealthOps] = useState(false);

  // User Settings State (Hydrated & Persisted to localStorage)
  const [zeroSound, setZeroSound] = useState<ZeroSoundType>("voice");
  const [volume, setVolume] = useState(0.85);
  const [creditsMusic, setCreditsMusic] = useState(true);
  const [creditsMode, setCreditsMode] = useState<"watercolor" | "video">("watercolor");

  // Operational Multi-Timers & Multi-Alarms
  const [timers, setTimers] = useState<OperationalTimer[]>(INITIAL_TIMERS);
  const [alarms, setAlarms] = useState<OperationalAlarm[]>(INITIAL_ALARMS);

  // Time Picker State
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<
    | { type: "timer"; timerId?: string }
    | { type: "alarm"; alarmId?: string }
    | null
  >(null);
  const [pickerInitial, setPickerInitial] = useState<SamsungTimePickerValues>({
    hours: 0,
    minutes: 25,
    seconds: 0,
    totalSeconds: 25 * 60,
  });

  // Fullscreen Cinematic Modals
  const [showOpeningModal, setShowOpeningModal] = useState(false);
  const [showCreditsModal, setShowCreditsModal] = useState(false);

  // Last Triggered Alarm tracking to avoid re-triggering during the same minute
  const lastAlarmTriggerRef = useRef<string>("");

  // 1-second system clock tick
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Safe SSR/Hydration: Load all persisted states on client mount
  useEffect(() => {
    try {
      const savedTimers = localStorage.getItem("ctu_timers_v74");
      if (savedTimers) setTimers(JSON.parse(savedTimers));

      const savedAlarms = localStorage.getItem("ctu_alarms_v74");
      if (savedAlarms) setAlarms(JSON.parse(savedAlarms));

      const savedVol = localStorage.getItem("ctu_volume");
      if (savedVol !== null) {
        const v = parseFloat(savedVol);
        setVolume(v);
        CTUAudio.setVolume(v);
      }

      const savedSound = localStorage.getItem("ctu_zero_sound");
      if (savedSound) setZeroSound(savedSound as ZeroSoundType);

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

  // Persist timers on update
  useEffect(() => {
    try {
      localStorage.setItem("ctu_timers_v74", JSON.stringify(timers));
    } catch {
      // Ignore storage errors
    }
  }, [timers]);

  // Persist alarms on update
  useEffect(() => {
    try {
      localStorage.setItem("ctu_alarms_v74", JSON.stringify(alarms));
    } catch {
      // Ignore storage errors
    }
  }, [alarms]);

  // Active timers engine loop (1000ms delta tick)
  useEffect(() => {
    const anyRunning = timers.some((t) => t.running && !t.timesUp);
    if (!anyRunning) return;

    const interval = setInterval(() => {
      setTimers((prev) =>
        prev.map((timer) => {
          if (!timer.running || timer.timesUp) return timer;
          const next = timer.remainingSec - 1;

          // Sound triggers at exactly <= 10 seconds
          if (next === 10) {
            CTUAudio.playCountdown(10);
          } else if (next === 5) {
            CTUAudio.playCountdown(5);
          } else if (next === 3) {
            CTUAudio.playCountdown(3);
          } else if (next <= 0) {
            CTUAudio.playZeroSound(zeroSound);
            return {
              ...timer,
              remainingSec: 0,
              running: false,
              timesUp: true,
              status: "EXPIRED (00:00:00)",
            };
          }

          return { ...timer, remainingSec: next };
        })
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [timers, zeroSound]);

  // Daily Alarms Watcher (Checks Bangkok Operational Time)
  useEffect(() => {
    const bkkStr = now.toLocaleTimeString("en-GB", {
      timeZone: "Asia/Bangkok",
      hour12: false,
    });
    const [bkkH, bkkM] = bkkStr.split(":").map(Number);
    const timeKey = `${bkkH}:${bkkM}`;

    if (lastAlarmTriggerRef.current === timeKey) return;

    const triggeredAlarm = alarms.find(
      (a) => a.armed && a.hour === bkkH && a.minute === bkkM
    );

    if (triggeredAlarm) {
      lastAlarmTriggerRef.current = timeKey;
      CTUAudio.playZeroSound(zeroSound);
    }
  }, [now, alarms, zeroSound]);

  // Manage Background Credits Audio Playback
  useEffect(() => {
    if (showCreditsModal && creditsMusic) {
      CTUAudio.startCreditsAudio();
    } else {
      CTUAudio.stopCreditsAudio();
    }
    return () => {
      CTUAudio.stopCreditsAudio();
    };
  }, [showCreditsModal, creditsMusic]);

  // Closest Active Timer for Primary Command Center Display
  const closestTimer = useMemo(() => {
    const active = timers.filter((t) => t.running && !t.timesUp);
    if (active.length > 0) {
      return [...active].sort((a, b) => a.remainingSec - b.remainingSec)[0];
    }
    const expired = timers.find((t) => t.timesUp);
    if (expired) return expired;
    return timers[0] || null;
  }, [timers]);

  // Chronologically Sorted Theaters (Ascending Local Time)
  const sortedTheaters = useMemo(() => {
    return [...WORLD_THEATERS].sort((a, b) => {
      const timeStrA = now.toLocaleTimeString("en-GB", { timeZone: a.zone, hour12: false });
      const timeStrB = now.toLocaleTimeString("en-GB", { timeZone: b.zone, hour12: false });
      return timeStrA.localeCompare(timeStrB);
    });
  }, [now]);

  // Clock display strings
  const bangkokTimeStr = now.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Bangkok",
    hour12: false,
  });
  const zuluTimeStr = now.toLocaleTimeString("en-GB", {
    timeZone: "UTC",
    hour12: false,
  });

  const isCriticalCountdown =
    closestTimer && closestTimer.running && closestTimer.remainingSec <= 10;
  const isExtremeShake =
    closestTimer && closestTimer.running && closestTimer.remainingSec <= 3;

  // Handlers for Timers
  const toggleTimer = (id: string) => {
    CTUAudio.resumeContext();
    setTimers((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          if (t.timesUp) {
            return {
              ...t,
              remainingSec: t.durationSec,
              running: true,
              timesUp: false,
              status: "ACTIVE",
            };
          }
          return { ...t, running: !t.running, status: !t.running ? "ACTIVE" : "PAUSED" };
        }
        return t;
      })
    );
  };

  const resetTimer = (id: string) => {
    CTUAudio.resumeContext();
    CTUAudio.stopAll();
    setTimers((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              remainingSec: t.durationSec,
              running: false,
              timesUp: false,
              status: "RESET",
            }
          : t
      )
    );
  };

  const deleteTimer = (id: string) => {
    setTimers((prev) => prev.filter((t) => t.id !== id));
  };

  const addTimer = () => {
    const newTimer: OperationalTimer = {
      id: `timer-${Date.now()}`,
      label: `TACTICAL OPERATION ${timers.length + 1}`,
      durationSec: 15 * 60,
      remainingSec: 15 * 60,
      running: false,
      timesUp: false,
      status: "READY",
    };
    setTimers((prev) => [...prev, newTimer]);
  };

  const applyPreset = (durationSec: number, label: string) => {
    CTUAudio.resumeContext();
    if (closestTimer) {
      setTimers((prev) =>
        prev.map((t) =>
          t.id === closestTimer.id
            ? {
                ...t,
                label,
                durationSec,
                remainingSec: durationSec,
                running: true,
                timesUp: false,
                status: "ACTIVE",
              }
            : t
        )
      );
    } else {
      const newTimer: OperationalTimer = {
        id: `timer-${Date.now()}`,
        label,
        durationSec,
        remainingSec: durationSec,
        running: true,
        timesUp: false,
        status: "ACTIVE",
      };
      setTimers((prev) => [...prev, newTimer]);
    }
  };

  // Handlers for Alarms
  const toggleAlarm = (id: string) => {
    setAlarms((prev) =>
      prev.map((a) => (a.id === id ? { ...a, armed: !a.armed } : a))
    );
  };

  const deleteAlarm = (id: string) => {
    setAlarms((prev) => prev.filter((a) => a.id !== id));
  };

  const addAlarm = () => {
    const newAlarm: OperationalAlarm = {
      id: `alarm-${Date.now()}`,
      label: `SCHEDULED OPERATION ${alarms.length + 1}`,
      hour: 8,
      minute: 30,
      armed: true,
    };
    setAlarms((prev) => [...prev, newAlarm]);
  };

  // Time Picker Triggers
  const openTimerPicker = (timerId?: string) => {
    const target = timerId ? timers.find((t) => t.id === timerId) : closestTimer;
    const dur = target ? target.remainingSec : 25 * 60;
    const { hours, minutes, seconds } = formatTime(dur);
    setPickerInitial({
      hours: parseInt(hours, 10),
      minutes: parseInt(minutes, 10),
      seconds: parseInt(seconds, 10),
      totalSeconds: dur,
    });
    setPickerTarget(target ? { type: "timer", timerId: target.id } : { type: "timer" });
    setPickerOpen(true);
  };

  const openAlarmPicker = (alarmId?: string) => {
    const target = alarmId ? alarms.find((a) => a.id === alarmId) : alarms[0];
    setPickerInitial({
      hours: target ? target.hour : 7,
      minutes: target ? target.minute : 0,
      seconds: 0,
      totalSeconds: (target ? target.hour : 7) * 3600 + (target ? target.minute : 0) * 60,
    });
    setPickerTarget(target ? { type: "alarm", alarmId: target.id } : { type: "alarm" });
    setPickerOpen(true);
  };

  const handlePickerConfirm = (vals: SamsungTimePickerValues) => {
    if (!pickerTarget) return;

    if (pickerTarget.type === "timer") {
      const totalSec = vals.hours * 3600 + vals.minutes * 60 + vals.seconds;
      const validSec = totalSec > 0 ? totalSec : 60;
      if (pickerTarget.timerId) {
        setTimers((prev) =>
          prev.map((t) =>
            t.id === pickerTarget.timerId
              ? {
                  ...t,
                  durationSec: validSec,
                  remainingSec: validSec,
                  running: false,
                  timesUp: false,
                  status: "READY",
                }
              : t
          )
        );
      }
    } else if (pickerTarget.type === "alarm") {
      if (pickerTarget.alarmId) {
        setAlarms((prev) =>
          prev.map((a) =>
            a.id === pickerTarget.alarmId
              ? { ...a, hour: vals.hours, minute: vals.minutes, armed: true }
              : a
          )
        );
      }
    }
    setPickerOpen(false);
  };

  // Settings Handlers with Storage persistence
  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    CTUAudio.setVolume(newVol);
    try {
      localStorage.setItem("ctu_volume", String(newVol));
    } catch {
      // Ignore
    }
  };

  const handleZeroSoundChange = (sound: ZeroSoundType) => {
    setZeroSound(sound);
    try {
      localStorage.setItem("ctu_zero_sound", sound);
    } catch {
      // Ignore
    }
  };

  const handleCreditsMusicToggle = () => {
    const nextVal = !creditsMusic;
    setCreditsMusic(nextVal);
    try {
      localStorage.setItem("ctu_credits_music", String(nextVal));
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

  const primaryRemaining = closestTimer ? closestTimer.remainingSec : 0;
  const { hours, minutes, seconds } = formatTime(primaryRemaining);

  return (
    <div
      className={`min-h-screen bg-black text-[#ffcc00] font-mono select-none overflow-x-hidden ${
        stealthOps ? "opacity-75 filter contrast-125" : ""
      }`}
    >
      {/* HEADER & TIME STRIP */}
      <header className="border-b border-[#ffcc00]/30 bg-black/95 sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-[1400px] mx-auto px-3 py-2 flex flex-wrap items-center justify-between gap-3">
          {/* CTU Tactical Identity */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 border border-[#ffcc00] flex items-center justify-center font-black text-lg bg-[#ffcc00]/10 tracking-tighter">
              24
            </div>
            <div>
              <div className="text-[12px] md:text-[14px] font-black tracking-[0.25em] text-[#ffcc00] flex items-center gap-2">
                CTU // TACTICAL OPERATIONS
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div className="text-[9px] md:text-[10px] text-[#ffcc00]/60 tracking-[0.18em]">
                LOS ANGELES DIVISION • FIELD GRID 7
              </div>
            </div>
          </div>

          {/* Dual Local (Bangkok) & Zulu Time */}
          <div className="flex items-center gap-4 text-right">
            <div>
              <div className="text-[9px] tracking-widest text-[#ffcc00]/70 font-bold">
                BANGKOK LOCAL
              </div>
              <div className="text-[16px] md:text-[20px] font-black text-[#ffcc00] glow tracking-wider">
                {bangkokTimeStr}
              </div>
            </div>
            <div className="border-l border-[#ffcc00]/30 pl-4">
              <div className="text-[9px] tracking-widest text-[#ffcc00]/70 font-bold">
                ZULU / UTC
              </div>
              <div className="text-[16px] md:text-[20px] font-black text-[#ffcc00]/90 tracking-wider">
                {zuluTimeStr}
              </div>
            </div>
          </div>
        </div>

        {/* MOVING WORLD TIME TICKER (CHRONOLOGICALLY SORTED BY ACTUAL TIME) */}
        <div className="border-t border-b border-[#ffcc00]/25 bg-black/90 overflow-hidden select-none py-1.5 relative">
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-black to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-black to-transparent z-10 pointer-events-none" />

          <div className="world-ticker-track flex items-center">
            {/* Loop 1 */}
            {sortedTheaters.map((theater) => {
              const timeStr = now.toLocaleTimeString("en-GB", {
                timeZone: theater.zone,
                hour12: false,
              });
              return (
                <div
                  key={`loop1-${theater.code}`}
                  className={`flex items-center gap-2 px-4 shrink-0 transition-opacity hover:opacity-100 ${
                    theater.isHome ? "text-[#ffcc00]" : "text-[#ffcc00]/85"
                  }`}
                >
                  <span
                    className={`text-[9px] tracking-[0.25em] font-black px-1.5 py-0.5 rounded-[2px] ${
                      theater.isHome ? "bg-[#ffcc00] text-black" : "bg-[#ffcc00]/15 text-[#ffcc00]"
                    }`}
                  >
                    {theater.code}
                  </span>
                  <span className="text-[12px] md:text-[13px] font-bold tracking-[0.14em]">
                    {theater.city}
                  </span>
                  <span
                    className={`text-[13px] md:text-[14px] font-black tracking-wider ${
                      theater.isHome ? "glow text-[#ffcc00]" : "text-[#ffcc00]/95"
                    }`}
                  >
                    {timeStr}
                  </span>
                  <span className="text-[#ffcc00]/30 ml-2 text-[12px]">•</span>
                </div>
              );
            })}

            {/* Loop 2 (Continuous Seamless Buffer) */}
            {sortedTheaters.map((theater) => {
              const timeStr = now.toLocaleTimeString("en-GB", {
                timeZone: theater.zone,
                hour12: false,
              });
              return (
                <div
                  key={`loop2-${theater.code}`}
                  className={`flex items-center gap-2 px-4 shrink-0 transition-opacity hover:opacity-100 ${
                    theater.isHome ? "text-[#ffcc00]" : "text-[#ffcc00]/85"
                  }`}
                >
                  <span
                    className={`text-[9px] tracking-[0.25em] font-black px-1.5 py-0.5 rounded-[2px] ${
                      theater.isHome ? "bg-[#ffcc00] text-black" : "bg-[#ffcc00]/15 text-[#ffcc00]"
                    }`}
                  >
                    {theater.code}
                  </span>
                  <span className="text-[12px] md:text-[13px] font-bold tracking-[0.14em]">
                    {theater.city}
                  </span>
                  <span
                    className={`text-[13px] md:text-[14px] font-black tracking-wider ${
                      theater.isHome ? "glow text-[#ffcc00]" : "text-[#ffcc00]/95"
                    }`}
                  >
                    {timeStr}
                  </span>
                  <span className="text-[#ffcc00]/30 ml-2 text-[12px]">•</span>
                </div>
              );
            })}
          </div>
        </div>
      </header>

      {/* MAIN OPERATIONS VIEWPORT */}
      <main className="max-w-[980px] mx-auto px-3 py-4 flex flex-col gap-4">
        {/* DUAL CINEMATIC BUTTONS */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => {
              CTUAudio.resumeContext();
              setShowOpeningModal(true);
            }}
            className="flex items-center justify-center gap-2 border border-[#ffcc00] bg-black/80 hover:bg-[#ffcc00]/15 active:scale-[0.98] py-2.5 px-3 transition"
          >
            <span className="text-sm">▶</span>
            <span className="text-xs md:text-sm font-black tracking-widest">
              24 OPENING
            </span>
          </button>
          <button
            onClick={() => {
              CTUAudio.resumeContext();
              setShowCreditsModal(true);
            }}
            className="flex items-center justify-center gap-2 border border-[#ffcc00] bg-black/80 hover:bg-[#ffcc00]/15 active:scale-[0.98] py-2.5 px-3 transition"
          >
            <span className="text-sm">★</span>
            <span className="text-xs md:text-sm font-black tracking-widest">
              ENDING CREDITS
            </span>
          </button>
        </div>

        {/* PRIMARY OPERATION CLOCK CARD */}
        <section
          className={`border-2 border-[#ffcc00] bg-black/90 p-4 md:p-6 transition-all relative ${
            isCriticalCountdown ? "pulse border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.5)]" : ""
          }`}
        >
          {/* Header Bar */}
          <div className="flex items-center justify-between border-b border-[#ffcc00]/30 pb-2 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-[11px] md:text-[13px] font-black tracking-[0.2em] text-[#ffcc00]">
                {closestTimer ? closestTimer.label : "PRIMARY OPERATION"}
              </span>
              <span
                className={`text-[9px] font-black px-1.5 py-0.2 rounded-sm ${
                  closestTimer?.timesUp
                    ? "bg-red-600 text-white"
                    : closestTimer?.running
                    ? "bg-amber-500 text-black"
                    : "bg-[#222222] text-[#ffcc00]"
                }`}
              >
                {closestTimer?.status || "STANDBY"}
              </span>
            </div>
            <button
              onClick={() => openTimerPicker(closestTimer?.id)}
              className="text-[10px] md:text-[11px] font-bold border border-[#ffcc00]/50 px-2 py-0.5 hover:bg-[#ffcc00] hover:text-black transition"
            >
              [ SET TIME ]
            </button>
          </div>

          {/* Authentic 24 Digital Readout Display */}
          <div className="flex items-center justify-center py-2 md:py-4">
            <div
              className={`flex items-baseline gap-1 md:gap-3 cursor-pointer ${
                isExtremeShake ? "ctu-shake-intense" : ""
              }`}
              onClick={() => openTimerPicker(closestTimer?.id)}
            >
              <div className="text-center">
                <div
                  className={`text-5xl md:text-8xl font-black tracking-tighter ${
                    isCriticalCountdown ? "text-red-500 glow" : "text-[#ffcc00] glow"
                  }`}
                >
                  {hours}
                </div>
                <div className="text-[8px] md:text-[10px] font-bold tracking-widest text-[#ffcc00]/60 mt-1">
                  HOURS
                </div>
              </div>
              <span
                className={`text-4xl md:text-7xl font-bold animate-pulse ${
                  isCriticalCountdown ? "text-red-500" : "text-[#ffcc00]"
                }`}
              >
                :
              </span>
              <div className="text-center">
                <div
                  className={`text-5xl md:text-8xl font-black tracking-tighter ${
                    isCriticalCountdown ? "text-red-500 glow" : "text-[#ffcc00] glow"
                  }`}
                >
                  {minutes}
                </div>
                <div className="text-[8px] md:text-[10px] font-bold tracking-widest text-[#ffcc00]/60 mt-1">
                  MINUTES
                </div>
              </div>
              <span
                className={`text-4xl md:text-7xl font-bold animate-pulse ${
                  isCriticalCountdown ? "text-red-500" : "text-[#ffcc00]"
                }`}
              >
                :
              </span>
              <div className="text-center">
                <div
                  className={`text-5xl md:text-8xl font-black tracking-tighter ${
                    isCriticalCountdown ? "text-red-500 glow" : "text-[#ffcc00] glow"
                  }`}
                >
                  {seconds}
                </div>
                <div className="text-[8px] md:text-[10px] font-bold tracking-widest text-[#ffcc00]/60 mt-1">
                  SECONDS
                </div>
              </div>
            </div>
          </div>

          {/* Primary Command Controls */}
          {closestTimer && (
            <div className="grid grid-cols-2 gap-3 mt-4">
              <button
                onClick={() => toggleTimer(closestTimer.id)}
                className={`py-3 font-black text-sm tracking-widest border transition active:scale-[0.98] ${
                  closestTimer.running
                    ? "bg-[#ffcc00]/20 text-[#ffcc00] border-[#ffcc00]"
                    : "bg-[#ffcc00] text-black border-[#ffcc00] hover:bg-[#ffcc00]/90"
                }`}
              >
                {closestTimer.timesUp
                  ? "RESTART OPERATION"
                  : closestTimer.running
                  ? "PAUSE"
                  : "EXECUTE"}
              </button>
              <button
                onClick={() => resetTimer(closestTimer.id)}
                className="py-3 font-black text-sm tracking-widest border border-[#ffcc00]/50 hover:bg-[#ffcc00]/10 active:scale-[0.98] transition"
              >
                ABORT / RESET
              </button>
            </div>
          )}

          {/* Quick CTU Presets Strip */}
          <div className="flex flex-wrap items-center gap-1.5 mt-4 pt-3 border-t border-[#ffcc00]/20">
            <span className="text-[10px] font-bold text-[#ffcc00]/60 mr-1">
              PRESETS:
            </span>
            {CTU_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => applyPreset(p.durationSec, p.label)}
                className="text-[10px] font-bold border border-[#ffcc00]/40 px-2 py-1 bg-black/60 hover:bg-[#ffcc00] hover:text-black transition"
              >
                {p.label}
              </button>
            ))}
          </div>
        </section>

        {/* MULTIPLE TIMERS SECTION */}
        <section className="border border-[#ffcc00]/40 bg-black/80 p-4">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#ffcc00]/20">
            <div className="text-xs md:text-sm font-black tracking-widest text-[#ffcc00]">
              TACTICAL TIMERS QUEUE ({timers.length})
            </div>
            <button
              onClick={addTimer}
              className="text-xs font-bold border border-[#ffcc00] px-3 py-1 bg-[#ffcc00]/10 hover:bg-[#ffcc00] hover:text-black transition"
            >
              + ADD OPERATION TIMER
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {timers.map((timer) => {
              const { hours: th, minutes: tm, seconds: ts } = formatTime(
                timer.remainingSec
              );
              return (
                <div
                  key={timer.id}
                  className={`border p-3 flex flex-wrap items-center justify-between gap-3 ${
                    timer.id === closestTimer?.id
                      ? "border-[#ffcc00] bg-[#ffcc00]/10"
                      : "border-[#ffcc00]/30 bg-black"
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black tracking-wider">
                        {timer.label}
                      </span>
                      <span
                        className={`text-[8px] font-bold px-1.5 py-0.2 rounded-sm ${
                          timer.timesUp
                            ? "bg-red-600 text-white"
                            : timer.running
                            ? "bg-amber-500 text-black"
                            : "bg-[#222222] text-[#ffcc00]"
                        }`}
                      >
                        {timer.status}
                      </span>
                    </div>
                    <div
                      className="text-2xl font-black text-[#ffcc00] tracking-tight cursor-pointer hover:underline"
                      onClick={() => openTimerPicker(timer.id)}
                    >
                      {th}:{tm}:{ts}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openTimerPicker(timer.id)}
                      className="text-xs font-bold border border-[#ffcc00]/40 px-2.5 py-1.5 hover:bg-[#ffcc00]/20 transition"
                    >
                      SET
                    </button>
                    <button
                      onClick={() => toggleTimer(timer.id)}
                      className={`text-xs font-bold px-3 py-1.5 transition ${
                        timer.running
                          ? "bg-[#ffcc00]/20 border border-[#ffcc00]"
                          : "bg-[#ffcc00] text-black"
                      }`}
                    >
                      {timer.running ? "PAUSE" : "START"}
                    </button>
                    <button
                      onClick={() => resetTimer(timer.id)}
                      className="text-xs font-bold border border-[#ffcc00]/40 px-2.5 py-1.5 hover:bg-[#ffcc00]/20 transition"
                    >
                      RESET
                    </button>
                    {timers.length > 1 && (
                      <button
                        onClick={() => deleteTimer(timer.id)}
                        className="text-xs font-bold border border-red-500 text-red-500 px-2 py-1.5 hover:bg-red-500 hover:text-black transition"
                      >
                        DEL
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* MULTIPLE DAILY ALARMS SECTION */}
        <section className="border border-[#ffcc00]/40 bg-black/80 p-4">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#ffcc00]/20">
            <div>
              <div className="text-xs md:text-sm font-black tracking-widest text-[#ffcc00]">
                SCHEDULED DAILY ALARMS ({alarms.length})
              </div>
              <div className="text-[10px] text-[#ffcc00]/60">
                SYNCED TO BANGKOK COMMAND TIME (UTC+7)
              </div>
            </div>
            <button
              onClick={addAlarm}
              className="text-xs font-bold border border-[#ffcc00] px-3 py-1 bg-[#ffcc00]/10 hover:bg-[#ffcc00] hover:text-black transition"
            >
              + ADD DAILY ALARM
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {alarms.map((alarm) => {
              const ah = String(alarm.hour).padStart(2, "0");
              const am = String(alarm.minute).padStart(2, "0");
              return (
                <div
                  key={alarm.id}
                  className="border border-[#ffcc00]/30 bg-black p-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black tracking-wider">
                        {alarm.label}
                      </span>
                      <span
                        className={`text-[8px] font-bold px-1.5 py-0.2 rounded-sm ${
                          alarm.armed
                            ? "bg-emerald-500 text-black"
                            : "bg-[#333333] text-[#777777]"
                        }`}
                      >
                        {alarm.armed ? "ARMED" : "DISARMED"}
                      </span>
                    </div>
                    <div
                      className="text-2xl font-black text-[#ffcc00] tracking-tight cursor-pointer hover:underline"
                      onClick={() => openAlarmPicker(alarm.id)}
                    >
                      {ah}:{am}:00
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openAlarmPicker(alarm.id)}
                      className="text-xs font-bold border border-[#ffcc00]/40 px-2.5 py-1.5 hover:bg-[#ffcc00]/20 transition"
                    >
                      SET
                    </button>
                    <button
                      onClick={() => toggleAlarm(alarm.id)}
                      className={`text-xs font-bold px-3 py-1.5 transition ${
                        alarm.armed
                          ? "bg-emerald-500 text-black"
                          : "border border-[#ffcc00]/40 text-[#ffcc00]"
                      }`}
                    >
                      {alarm.armed ? "DISARM" : "ARM"}
                    </button>
                    {alarms.length > 1 && (
                      <button
                        onClick={() => deleteAlarm(alarm.id)}
                        className="text-xs font-bold border border-red-500 text-red-500 px-2 py-1.5 hover:bg-red-500 hover:text-black transition"
                      >
                        DEL
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* TACTICAL AUDIO & HARSH SYSTEM CONTROLS */}
        <section className="border border-[#ffcc00]/30 bg-black/90 p-4">
          <div className="text-xs md:text-sm font-black tracking-widest text-[#ffcc00] pb-2 mb-3 border-b border-[#ffcc00]/20">
            AUDIO MATRIX & SYSTEM PREFERENCES
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Zero Sound Selector */}
            <div>
              <label className="text-[10px] font-bold tracking-widest block text-[#ffcc00]/80 mb-1">
                COUNTDOWN AT ZERO SOUND
              </label>
              <select
                value={zeroSound}
                onChange={(e) => handleZeroSoundChange(e.target.value as ZeroSoundType)}
                className="w-full bg-black border border-[#ffcc00] text-[#ffcc00] text-xs font-bold p-2 outline-none focus:ring-1 focus:ring-[#ffcc00]"
              >
                {Object.entries(ZERO_SOUND_LABELS).map(([k, label]) => (
                  <option key={k} value={k} className="bg-black text-[#ffcc00]">
                    {label}
                  </option>
                ))}
              </select>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => {
                    CTUAudio.resumeContext();
                    CTUAudio.playZeroSound(zeroSound);
                  }}
                  className="text-[10px] font-black border border-[#ffcc00]/50 px-2 py-1 hover:bg-[#ffcc00] hover:text-black transition"
                >
                  TEST ZERO AUDIO
                </button>
                <button
                  onClick={() => {
                    CTUAudio.resumeContext();
                    CTUAudio.playCountdown(10);
                  }}
                  className="text-[10px] font-black border border-[#ffcc00]/50 px-2 py-1 hover:bg-[#ffcc00] hover:text-black transition"
                >
                  TEST 10S COUNTDOWN
                </button>
              </div>
            </div>

            {/* Tactical Master Volume */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] font-bold tracking-widest text-[#ffcc00]/80">
                  MASTER TERMINAL VOLUME
                </label>
                <span className="text-[11px] font-black text-[#ffcc00]">
                  {Math.round(volume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-full mt-2"
              />
              <div className="flex justify-between text-[9px] text-[#ffcc00]/50 mt-1">
                <span>SILENT</span>
                <span>TACTICAL MAXIMUM</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* SAMSUNG STYLE TIME PICKER MODAL */}
      {pickerOpen && (
        <SamsungTimePicker
          mode={pickerTarget?.type === "alarm" ? "alarm" : "timer"}
          initialHours={pickerInitial.hours}
          initialMinutes={pickerInitial.minutes}
          initialSeconds={pickerInitial.seconds}
          onSave={handlePickerConfirm}
          onCancel={() => setPickerOpen(false)}
        />
      )}

      {/* 24 OPENING CINEMATIC MODAL */}
      {showOpeningModal && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-2">
          <div className="w-full max-w-[800px] border border-[#ffcc00] bg-black p-2 relative shadow-[0_0_50px_rgba(255,204,0,0.3)]">
            <div className="flex justify-between items-center border-b border-[#ffcc00]/40 pb-2 mb-2">
              <span className="text-xs font-black tracking-widest text-[#ffcc00]">
                CTU SURVEILLANCE FEED // 24 OPENING TRANSMISSION
              </span>
              <button
                onClick={() => setShowOpeningModal(false)}
                className="text-xs font-bold border border-[#ffcc00] px-2 py-0.5 hover:bg-[#ffcc00] hover:text-black transition"
              >
                CLOSE [ESC]
              </button>
            </div>
            <div className="relative aspect-video w-full bg-black overflow-hidden flex items-center justify-center">
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

      {/* 24 ENDING CREDITS CINEMATIC MODAL */}
      {showCreditsModal && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-2 md:p-6 overflow-hidden">
          <div className="w-full max-w-[1000px] h-full max-h-[720px] border-2 border-[#ffcc00] bg-black flex flex-col relative shadow-[0_0_60px_rgba(255,204,0,0.4)]">
            {/* Header / Mode Controls */}
            <div className="flex flex-wrap items-center justify-between border-b border-[#ffcc00]/40 p-3 bg-black/95 z-20">
              <div className="flex items-center gap-2">
                <span className="text-xs md:text-sm font-black tracking-[0.2em] text-[#ffcc00]">
                  CTU ARCHIVE DEPT. // 24 CREDITS REEL
                </span>
                <span className="text-[10px] bg-[#ffcc00] text-black font-black px-1.5 py-0.2">
                  TOP SECRET
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreditsMusicToggle}
                  className={`text-[10px] md:text-xs font-bold border px-2.5 py-1 transition ${
                    creditsMusic
                      ? "border-[#ffcc00] bg-[#ffcc00] text-black"
                      : "border-[#ffcc00]/40 text-[#ffcc00]/70"
                  }`}
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
                  onClick={() => setShowCreditsModal(false)}
                  className="text-[10px] md:text-xs font-bold border border-red-500 text-red-500 px-2.5 py-1 hover:bg-red-500 hover:text-black transition"
                >
                  CLOSE
                </button>
              </div>
            </div>

            {/* Main Credits Viewport */}
            <div className="flex-1 relative overflow-hidden bg-black flex items-center justify-center">
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
                  {/* Tactical 3x2 Watercolor Surveillance Matrix */}
                  <div className="absolute inset-0 grid grid-cols-3 grid-rows-2 gap-1 opacity-70 p-1 pointer-events-none">
                    {WATERCOLOR_IMAGES.slice(0, 6).map((imgSrc, idx) => (
                      <div
                        key={idx}
                        className="relative w-full h-full overflow-hidden border border-[#ffcc00]/20 bg-black"
                      >
                        <img
                          src={imgSrc}
                          alt="CTU Archive"
                          className="w-full h-full object-cover ken watercolor"
                        />
                        <div className="absolute top-1 left-1 bg-black/80 text-[8px] font-bold text-[#ffcc00] px-1 tracking-widest">
                          CAM-0{idx + 1}
                        </div>
                      </div>
                    ))}
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
                        <div className="text-[11px] font-bold tracking-[0.3em] text-[#ffcc00]/80 mt-1">
                          COUNTER TERRORIST UNIT
                        </div>
                      </div>

                      {CREDITS_NAMES.map((c, i) => (
                        <div key={i} className="space-y-1">
                          <div className="text-[10px] md:text-[11px] font-bold tracking-[0.25em] text-[#ffcc00]/60 uppercase">
                            {c.role}
                          </div>
                          <div className="text-sm md:text-lg font-black tracking-widest text-[#ffcc00] glow uppercase">
                            {c.name}
                          </div>
                        </div>
                      ))}

                      <div className="pt-12 text-[11px] font-bold tracking-[0.2em] text-[#ffcc00]/50">
                        ALL RIGHTS RESERVED • CTU OPERATIONS 2026
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
