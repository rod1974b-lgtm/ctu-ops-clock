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
interface WorldTheater {
  code: string;
  city: string;
  zone: string;
  isHome?: boolean;
}

const WORLD_THEATERS: WorldTheater[] = [
  { code: "UTC", city: "ZULU HQ", zone: "UTC" },
  { code: "BKK", city: "BANGKOK [ACTIVE]", zone: "Asia/Bangkok", isHome: true },
  { code: "LAX", city: "LOS ANGELES (CTU)", zone: "America/Los_Angeles" },
  { code: "WAS", city: "WASHINGTON D.C.", zone: "America/New_York" },
  { code: "NYC", city: "NEW YORK", zone: "America/New_York" },
  { code: "CHI", city: "CHICAGO", zone: "America/Chicago" },
  { code: "DEN", city: "DENVER", zone: "America/Denver" },
  { code: "HNL", city: "HONOLULU", zone: "Pacific/Honolulu" },
  { code: "LON", city: "LONDON (MI6)", zone: "Europe/London" },
  { code: "PAR", city: "PARIS", zone: "Europe/Paris" },
  { code: "BER", city: "BERLIN", zone: "Europe/Berlin" },
  { code: "CAI", city: "CAIRO", zone: "Africa/Cairo" },
  { code: "MOW", city: "MOSCOW", zone: "Europe/Moscow" },
  { code: "DXB", city: "DUBAI", zone: "Asia/Dubai" },
  { code: "SIN", city: "SINGAPORE", zone: "Asia/Singapore" },
  { code: "HKG", city: "HONG KONG", zone: "Asia/Hong_Kong" },
  { code: "TYO", city: "TOKYO", zone: "Asia/Tokyo" },
  { code: "SYD", city: "SYDNEY", zone: "Australia/Sydney" },
  { code: "AKL", city: "AUCKLAND", zone: "Pacific/Auckland" },
  { code: "SAO", city: "SÃO PAULO", zone: "America/Sao_Paulo" },
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
  "/24_accurate_watercolors_final/13_michelle_dessler_listening_post.webp",
  "/24_accurate_watercolors_final/14_edgar_terminal_focus.webp",
  "/24_accurate_watercolors_final/15_ctu_bullpen_busy_desks.webp",
  "/24_accurate_watercolors_final/16_ctu_server_bank_blue_amber.webp",
  "/24_accurate_watercolors_final/17_ctu_briefing_room_screens.webp",
  "/24_accurate_watercolors_final/18_ctu_glass_corridor_suits.webp",
  "/24_accurate_watercolors_final/19_ctu_exterior_night_los_angeles.webp",
  "/24_accurate_watercolors_final/20_palmer_hotel_balcony_speech.webp",
  "/24_accurate_watercolors_final/21_palmer_suite_phone_shadows.webp",
  "/24_accurate_watercolors_final/22_sherry_whispering_campaign.webp",
  "/24_accurate_watercolors_final/23_suv_convoy_desert_highway.webp",
  "/24_accurate_watercolors_final/24_black_van_stakeout_rain.webp",
  "/24_accurate_watercolors_final/25_helicopter_searchlight_la_river.webp",
  "/24_accurate_watercolors_final/26_warehouse_raid_muzzle_flashes.webp",
  "/24_accurate_watercolors_final/27_docks_shipping_containers_fog.webp",
  "/24_accurate_watercolors_final/28_abandoned_factory_amber_beams.webp",
  "/24_accurate_watercolors_final/29_hotel_lobby_surveillance_cam.webp",
  "/24_accurate_watercolors_final/30_suburban_safehouse_twilight.webp",
  "/24_accurate_watercolors_final/31_desert_compound_sunset_dust.webp",
  "/24_accurate_watercolors_final/32_interrogation_room_single_lamp.webp",
];

const STORAGE_KEYS = {
  TIMERS: "ctu_v74_timers_list",
  ALARMS: "ctu_v74_alarms_list",
  VOLUME: "ctu_v74_audio_volume",
  ZERO_SOUND: "ctu_v74_zero_sound_choice",
  CREDITS_MODE: "ctu_v74_credits_view_mode",
  MUSIC_MUTED: "ctu_v74_music_muted",
};

export default function CTUTerminalV74() {
  const [timers, setTimers] = useState<OperationalTimer[]>(INITIAL_TIMERS);
  const [alarms, setAlarms] = useState<OperationalAlarm[]>(INITIAL_ALARMS);
  const [audioVolume, setAudioVolume] = useState<number>(85);
  const [zeroSound, setZeroSound] = useState<ZeroSoundType>("voice");
  const [creditsViewMode, setCreditsViewMode] = useState<"video" | "watercolors">("watercolors");
  const [hasHydratedStorage, setHasHydratedStorage] = useState<boolean>(false);

  // Active Picker Modal State
  const [pickerModal, setPickerModal] = useState<{
    open: boolean;
    mode: "timer" | "alarm";
    targetId?: string;
    initialValues: SamsungTimePickerValues;
  }>({
    open: false,
    mode: "timer",
    initialValues: { hours: 0, minutes: 25, seconds: 0 },
  });

  // Video Modals
  const [activeVideoModal, setActiveVideoModal] = useState<"opening" | "credits" | null>(null);
  const [creditsStep, setCreditsStep] = useState<number>(0);
  const [creditsMusicOn, setCreditsMusicOn] = useState<boolean>(true);

  // Master Clock: Live real-time Bangkok
  const [now, setNow] = useState<Date>(() => new Date());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Audio Engine Instance
  const audioRef = useRef<CTUAudio | null>(null);
  const audioUnlockedRef = useRef<boolean>(false);

  const prevSecRef = useRef<number>(-1);
  const triggeredAlarmsRef = useRef<Set<string>>(new Set());

  // 1. Storage Hydration
  useEffect(() => {
    try {
      const savedTimers = localStorage.getItem(STORAGE_KEYS.TIMERS);
      if (savedTimers) {
        const parsed = JSON.parse(savedTimers);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const paused = parsed.map((t: OperationalTimer) => ({
            ...t,
            running: false,
            status: t.timesUp ? "TIMES UP" : "PAUSED",
          }));
          setTimers(paused);
        }
      }

      const savedAlarms = localStorage.getItem(STORAGE_KEYS.ALARMS);
      if (savedAlarms) {
        const parsed = JSON.parse(savedAlarms);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setAlarms(parsed);
        }
      }

      const savedVol = localStorage.getItem(STORAGE_KEYS.VOLUME);
      if (savedVol !== null) {
        const v = parseInt(savedVol, 10);
        if (!isNaN(v)) setAudioVolume(Math.max(0, Math.min(100, v)));
      }

      const savedSound = localStorage.getItem(STORAGE_KEYS.ZERO_SOUND) as ZeroSoundType | null;
      if (savedSound && savedSound in ZERO_SOUND_LABELS) {
        setZeroSound(savedSound);
      }

      const savedMode = localStorage.getItem(STORAGE_KEYS.CREDITS_MODE);
      if (savedMode === "video" || savedMode === "watercolors") {
        setCreditsViewMode(savedMode);
      }

      const savedMute = localStorage.getItem(STORAGE_KEYS.MUSIC_MUTED);
      if (savedMute !== null) {
        setCreditsMusicOn(savedMute !== "true");
      }
    } catch (err) {
      console.warn("Storage hydration warning:", err);
    } finally {
      setHasHydratedStorage(true);
    }
  }, []);

  // 2. Storage Persistence
  useEffect(() => {
    if (!hasHydratedStorage) return;
    try {
      localStorage.setItem(STORAGE_KEYS.TIMERS, JSON.stringify(timers));
    } catch (e) {
      console.warn("Failed to persist timers:", e);
    }
  }, [timers, hasHydratedStorage]);

  useEffect(() => {
    if (!hasHydratedStorage) return;
    try {
      localStorage.setItem(STORAGE_KEYS.ALARMS, JSON.stringify(alarms));
    } catch (e) {
      console.warn("Failed to persist alarms:", e);
    }
  }, [alarms, hasHydratedStorage]);

  useEffect(() => {
    if (!hasHydratedStorage) return;
    try {
      localStorage.setItem(STORAGE_KEYS.VOLUME, String(audioVolume));
      localStorage.setItem(STORAGE_KEYS.ZERO_SOUND, zeroSound);
      localStorage.setItem(STORAGE_KEYS.CREDITS_MODE, creditsViewMode);
      localStorage.setItem(STORAGE_KEYS.MUSIC_MUTED, String(!creditsMusicOn));
    } catch (e) {
      console.warn("Failed to persist preferences:", e);
    }
  }, [audioVolume, zeroSound, creditsViewMode, creditsMusicOn, hasHydratedStorage]);

  // Audio Context Initialization
  const unlockAudio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new CTUAudio();
    }
    if (!audioUnlockedRef.current) {
      audioRef.current.unlock();
      audioUnlockedRef.current = true;
    }
    audioRef.current.setMasterVolume(audioVolume / 100);
  }, [audioVolume]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 2800);
  }, []);

  // Live real-time tick (every 250ms)
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

  // Primary operational timer (closest to zero)
  const primaryTimer = useMemo(() => {
    if (timers.length === 0) return null;
    const runningOnes = timers.filter((t) => t.running && !t.timesUp);
    if (runningOnes.length > 0) {
      return [...runningOnes].sort((a, b) => a.remainingSec - b.remainingSec)[0];
    }
    const nonFinished = timers.filter((t) => !t.timesUp);
    if (nonFinished.length > 0) {
      return [...nonFinished].sort((a, b) => a.remainingSec - b.remainingSec)[0];
    }
    return timers[0];
  }, [timers]);

  const isTakeover = Boolean(
    primaryTimer &&
      primaryTimer.running &&
      primaryTimer.remainingSec > 0 &&
      primaryTimer.remainingSec <= 10
  );

  const isIntenseShake = Boolean(
    primaryTimer &&
      primaryTimer.running &&
      primaryTimer.remainingSec > 0 &&
      primaryTimer.remainingSec <= 3
  );

  // 1-Second Timer & Alarm Engine
  useEffect(() => {
    const interval = setInterval(() => {
      const curSec = bangkokDate.getSeconds();
      if (curSec === prevSecRef.current) return;
      prevSecRef.current = curSec;

      // 1. Tick Running Timers
      setTimers((prevTimers) => {
        let changed = false;
        const next = prevTimers.map((timer) => {
          if (!timer.running || timer.timesUp) return timer;
          changed = true;
          const nextRemaining = Math.max(0, timer.remainingSec - 1);

          // Audio escalation triggers
          if (nextRemaining > 0 && nextRemaining <= 10) {
            if (audioUnlockedRef.current && audioRef.current) {
              if (nextRemaining <= 3) {
                audioRef.current.playCountdownTriple();
              } else if (nextRemaining <= 5) {
                audioRef.current.playCountdownDouble();
              } else {
                audioRef.current.playCountdownSingle();
              }
            }
          }

          if (nextRemaining === 0) {
            if (audioUnlockedRef.current && audioRef.current) {
              if (zeroSound === "voice") {
                audioRef.current.playVoiceZero();
              } else if (zeroSound === "boom") {
                audioRef.current.playImpactBoom();
              } else if (zeroSound === "alarm") {
                audioRef.current.playCrisisLoop();
              } else if (zeroSound === "ctu_beep") {
                audioRef.current.playCTUBeep();
              } else {
                audioRef.current.playStinger();
              }
            }
            return {
              ...timer,
              remainingSec: 0,
              running: false,
              timesUp: true,
              status: "TARGET ZERO REACHED",
            };
          }

          return {
            ...timer,
            remainingSec: nextRemaining,
            status: "ENGAGED",
          };
        });

        return changed ? next : prevTimers;
      });

      // 2. Check Daily Alarms against Bangkok local time
      const curHour = bangkokDate.getHours();
      const curMinute = bangkokDate.getMinutes();

      alarms.forEach((alarm) => {
        if (!alarm.armed) return;
        const alarmKey = `${alarm.id}-${curHour}-${curMinute}`;

        if (alarm.hour === curHour && alarm.minute === curMinute && curSec === 0) {
          if (!triggeredAlarmsRef.current.has(alarmKey)) {
            triggeredAlarmsRef.current.add(alarmKey);
            showToast(`ALARM DETONATED: ${alarm.label}`);
            if (audioUnlockedRef.current && audioRef.current) {
              audioRef.current.playCrisisLoop();
            }
          }
        }
      });

      if (curSec === 1) {
        triggeredAlarmsRef.current.clear();
      }
    }, 250);

    return () => clearInterval(interval);
  }, [bangkokDate, alarms, zeroSound, showToast]);

  // Timer Control Handlers
  const handleStartTimer = (id: string) => {
    unlockAudio();
    setTimers((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          return {
            ...t,
            running: true,
            timesUp: false,
            status: "ENGAGED",
          };
        }
        return t;
      })
    );
  };

  const handlePauseTimer = (id: string) => {
    setTimers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, running: false, status: "PAUSED" } : t))
    );
    if (audioRef.current) {
      audioRef.current.stopAll();
    }
  };

  const handleResetTimer = (id: string) => {
    setTimers((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              remainingSec: t.durationSec,
              running: false,
              timesUp: false,
              status: "READY",
            }
          : t
      )
    );
    if (audioRef.current) {
      audioRef.current.stopAll();
    }
  };

  const handleDeleteTimer = (id: string) => {
    if (timers.length <= 1) {
      showToast("MINIMUM 1 OPERATION TIMER REQUIRED");
      return;
    }
    setTimers((prev) => prev.filter((t) => t.id !== id));
    showToast("OPERATION CANCELLED & PURGED");
  };

  const handleApplyPreset = (durationSec: number, label: string) => {
    unlockAudio();
    const newTimer: OperationalTimer = {
      id: `timer-${Date.now()}`,
      label,
      durationSec,
      remainingSec: durationSec,
      running: true,
      timesUp: false,
      status: "ENGAGED",
    };
    setTimers((prev) => [newTimer, ...prev]);
    showToast(`ARMED & ENGAGED: ${label}`);
  };

  // Alarm Control Handlers
  const handleToggleAlarm = (id: string) => {
    unlockAudio();
    setTimers((prev) => prev); // keep state fresh
    setAlarms((prev) =>
      prev.map((a) => {
        if (a.id === id) {
          const nextArmed = !a.armed;
          showToast(nextArmed ? `ALARM ARMED: ${a.label}` : `ALARM STAND-DOWN: ${a.label}`);
          return { ...a, armed: nextArmed };
        }
        return a;
      })
    );
  };

  const handleDeleteAlarm = (id: string) => {
    if (alarms.length <= 1) {
      showToast("MINIMUM 1 ALARM PROTOCOL REQUIRED");
      return;
    }
    setAlarms((prev) => prev.filter((a) => a.id !== id));
    showToast("ALARM TARGET TERMINATED");
  };

  // Sound Test Action
  const handleTestZeroSound = (type: ZeroSoundType) => {
    unlockAudio();
    if (!audioRef.current) return;
    if (type === "voice") {
      audioRef.current.playVoiceZero();
    } else if (type === "boom") {
      audioRef.current.playImpactBoom();
    } else if (type === "alarm") {
      audioRef.current.playCrisisLoop();
    } else if (type === "ctu_beep") {
      audioRef.current.playCTUBeep();
    } else {
      audioRef.current.playStinger();
    }
  };

  // Picker Confirmation Handler
  const handlePickerConfirm = (values: SamsungTimePickerValues) => {
    if (pickerModal.mode === "timer") {
      const totalSec = values.hours * 3600 + values.minutes * 60 + values.seconds;
      if (totalSec <= 0) {
        showToast("DURATION MUST BE GREATER THAN 0");
        return;
      }
      if (pickerModal.targetId) {
        setTimers((prev) =>
          prev.map((t) =>
            t.id === pickerModal.targetId
              ? {
                  ...t,
                  durationSec: totalSec,
                  remainingSec: totalSec,
                  running: false,
                  timesUp: false,
                  status: "READY",
                }
              : t
          )
        );
        showToast("OPERATION PARAMETERS UPDATED");
      } else {
        const newTimer: OperationalTimer = {
          id: `timer-${Date.now()}`,
          label: `OPERATION ${timers.length + 1}`,
          durationSec: totalSec,
          remainingSec: totalSec,
          running: false,
          timesUp: false,
          status: "READY",
        };
        setTimers((prev) => [...prev, newTimer]);
        showToast("NEW OPERATION INITIATED");
      }
    } else {
      // Alarm Mode
      if (pickerModal.targetId) {
        setAlarms((prev) =>
          prev.map((a) =>
            a.id === pickerModal.targetId
              ? {
                  ...a,
                  hour: values.hours,
                  minute: values.minutes,
                  armed: true,
                }
              : a
          )
        );
        showToast("ALARM COORDINATES RECONFIGURED");
      } else {
        const newAlarm: OperationalAlarm = {
          id: `alarm-${Date.now()}`,
          label: `TARGET ALERT ${alarms.length + 1}`,
          hour: values.hours,
          minute: values.minutes,
          armed: true,
        };
        setAlarms((prev) => [...prev, newAlarm]);
        showToast("NEW SURVEILLANCE ALARM ARMED");
      }
    }
    setPickerModal((prev) => ({ ...prev, open: false }));
  };

  const formatHms = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

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

        {/* MOVING WORLD TIME TICKER */}
        <div className="border-t border-b border-[#ffcc00]/25 bg-black/90 overflow-hidden select-none py-1.5 relative">
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-black to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-black to-transparent z-10 pointer-events-none" />

          <div className="world-ticker-track flex items-center">
            {/* Loop 1 */}
            {WORLD_THEATERS.map((theater) => {
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
            {WORLD_THEATERS.map((theater) => {
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
            24 ENDING CREDITS
          </button>
        </div>

        {/* PRIMARY ACTIVE OPERATION DISPLAY */}
        {primaryTimer && (
          <section
            className={`border-2 p-4 rounded-[8px] transition-all relative overflow-hidden ${
              primaryTimer.timesUp
                ? "border-red-600 bg-red-950/25 shadow-[0_0_30px_rgba(255,0,0,0.4)]"
                : primaryTimer.remainingSec <= 10 && primaryTimer.running
                ? "border-red-500 bg-red-950/20 shadow-[0_0_24px_rgba(255,0,0,0.3)]"
                : "border-[#ffcc00]/60 bg-black shadow-[0_0_16px_rgba(255,204,0,0.15)]"
            }`}
          >
            <div className="flex items-center justify-between border-b border-[#ffcc00]/20 pb-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ffcc00] animate-ping" />
                <h2 className="text-[13px] font-black tracking-[0.25em] uppercase">
                  {primaryTimer.label}
                </h2>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded tracking-widest ${
                  primaryTimer.timesUp
                    ? "bg-red-600 text-white animate-pulse"
                    : primaryTimer.running
                    ? "bg-[#ffcc00] text-black"
                    : "bg-[#222] text-[#ffcc00]"
                }`}
              >
                {primaryTimer.status}
              </span>
            </div>

            {/* COUNTDOWN READOUT WITH TACTICAL SHAKE */}
            <div className="py-2 text-center">
              <div
                className={`font-black tracking-tight leading-none ${
                  primaryTimer.timesUp
                    ? "text-red-500 animate-pulse"
                    : isIntenseShake
                    ? "ctu-shake-intense text-red-500"
                    : primaryTimer.remainingSec <= 10 && primaryTimer.running
                    ? "text-red-400"
                    : "glow text-[#ffcc00]"
                }`}
                style={{ fontSize: "clamp(56px, 15vw, 120px)" }}
              >
                {formatHms(primaryTimer.remainingSec)}
              </div>
            </div>

            {/* PRIMARY CONTROLS */}
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-[#ffcc00]/20">
              {primaryTimer.running ? (
                <button
                  type="button"
                  onClick={() => handlePauseTimer(primaryTimer.id)}
                  className="bg-black text-[#ffcc00] border border-[#ffcc00] font-bold text-[13px] py-2.5 rounded hover:bg-[#ffcc00] hover:text-black transition-colors cursor-pointer"
                >
                  PAUSE
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleStartTimer(primaryTimer.id)}
                  className="bg-[#ffcc00] text-black font-black text-[13px] py-2.5 rounded hover:bg-black hover:text-[#ffcc00] border border-[#ffcc00] transition-colors cursor-pointer"
                >
                  ENGAGE
                </button>
              )}
              <button
                type="button"
                onClick={() => handleResetTimer(primaryTimer.id)}
                className="bg-black text-[#ffcc00]/80 border border-[#ffcc00]/40 font-bold text-[13px] py-2.5 rounded hover:border-[#ffcc00] hover:text-[#ffcc00] transition-colors cursor-pointer"
              >
                RESET
              </button>
              <button
                type="button"
                onClick={() =>
                  setPickerModal({
                    open: true,
                    mode: "timer",
                    targetId: primaryTimer.id,
                    initialValues: {
                      hours: Math.floor(primaryTimer.durationSec / 3600),
                      minutes: Math.floor((primaryTimer.durationSec % 3600) / 60),
                      seconds: primaryTimer.durationSec % 60,
                    },
                  })
                }
                className="bg-black text-[#ffcc00]/80 border border-[#ffcc00]/40 font-bold text-[13px] py-2.5 rounded hover:border-[#ffcc00] hover:text-[#ffcc00] transition-colors cursor-pointer"
              >
                ADJUST
              </button>
            </div>
          </section>
        )}

        {/* CTU QUICK-ARM PRESETS */}
        <section className="border border-[#ffcc00]/30 p-3 rounded-[8px] bg-black">
          <h3 className="text-[10px] font-black tracking-[0.25em] text-[#ffcc00]/70 mb-2">
            CTU QUICK-ARM PRESETS
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {CTU_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleApplyPreset(p.durationSec, p.label)}
                className="bg-[#111] hover:bg-[#ffcc00] text-[#ffcc00] hover:text-black border border-[#ffcc00]/30 hover:border-[#ffcc00] p-2 text-left rounded transition-colors cursor-pointer"
              >
                <div className="text-[10px] font-black tracking-wider truncate">{p.label}</div>
                <div className="text-[12px] opacity-75 font-mono">{formatHms(p.durationSec)}</div>
              </button>
            ))}
          </div>
        </section>

        {/* MULTIPLE TIMERS SECTION */}
        <section className="border border-[#ffcc00]/30 p-3 rounded-[8px] bg-black">
          <div className="flex items-center justify-between mb-3 border-b border-[#ffcc00]/20 pb-2">
            <div>
              <h3 className="text-[12px] font-black tracking-[0.25em]">OPERATIONAL TIMERS</h3>
              <span className="text-[9px] opacity-60">ACTIVE QUEUE: {timers.length} TIMERS</span>
            </div>
            <button
              type="button"
              onClick={() =>
                setPickerModal({
                  open: true,
                  mode: "timer",
                  initialValues: { hours: 0, minutes: 20, seconds: 0 },
                })
              }
              className="bg-[#ffcc00] text-black font-black text-[11px] px-3 py-1.5 rounded border border-[#ffcc00] hover:bg-black hover:text-[#ffcc00] transition-colors cursor-pointer"
            >
              + ADD OPERATION
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {timers.map((timer) => (
              <div
                key={timer.id}
                className={`border p-2.5 rounded-[6px] bg-[#0c0c0c] flex flex-col justify-between gap-2 ${
                  timer.timesUp
                    ? "border-red-600 bg-red-950/20"
                    : timer.running
                    ? "border-[#ffcc00]/70"
                    : "border-[#ffcc00]/25"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black tracking-wider truncate max-w-[170px]">
                    {timer.label}
                  </span>
                  <span
                    className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${
                      timer.timesUp
                        ? "bg-red-600 text-white"
                        : timer.running
                        ? "bg-[#ffcc00] text-black"
                        : "bg-[#222] text-[#ffcc00]/70"
                    }`}
                  >
                    {timer.status}
                  </span>
                </div>

                <div className="text-center py-1">
                  <span
                    className={`text-[28px] font-black leading-none ${
                      timer.timesUp ? "text-red-500 animate-pulse" : "text-[#ffcc00]"
                    }`}
                  >
                    {formatHms(timer.remainingSec)}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1 pt-1 border-t border-[#ffcc00]/15">
                  {timer.running ? (
                    <button
                      type="button"
                      onClick={() => handlePauseTimer(timer.id)}
                      className="bg-black text-[#ffcc00] border border-[#ffcc00]/50 text-[10px] py-1 rounded hover:bg-[#ffcc00] hover:text-black transition-colors"
                    >
                      PAUSE
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleStartTimer(timer.id)}
                      className="bg-[#ffcc00] text-black text-[10px] font-black py-1 rounded hover:bg-black hover:text-[#ffcc00] border border-[#ffcc00] transition-colors"
                    >
                      ENGAGE
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleResetTimer(timer.id)}
                    className="bg-black text-[#ffcc00]/80 border border-[#ffcc00]/30 text-[10px] py-1 rounded hover:border-[#ffcc00]"
                  >
                    RESET
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteTimer(timer.id)}
                    className="bg-black text-red-400 border border-red-500/30 text-[10px] py-1 rounded hover:bg-red-950/40"
                  >
                    DELETE
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* MULTIPLE DAILY ALARMS SECTION */}
        <section className="border border-[#ffcc00]/30 p-3 rounded-[8px] bg-black">
          <div className="flex items-center justify-between mb-3 border-b border-[#ffcc00]/20 pb-2">
            <div>
              <h3 className="text-[12px] font-black tracking-[0.25em]">DAILY SURVEILLANCE ALARMS</h3>
              <span className="text-[9px] opacity-60">
                ACTIVE QUEUE: {alarms.length} SCHEDULES (ASIA/BANGKOK TIME)
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                setPickerModal({
                  open: true,
                  mode: "alarm",
                  initialValues: { hours: 8, minutes: 0, seconds: 0 },
                })
              }
              className="bg-[#ffcc00] text-black font-black text-[11px] px-3 py-1.5 rounded border border-[#ffcc00] hover:bg-black hover:text-[#ffcc00] transition-colors cursor-pointer"
            >
              + ADD ALARM
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {alarms.map((alarm) => {
              const displayH = String(alarm.hour).padStart(2, "0");
              const displayM = String(alarm.minute).padStart(2, "0");

              return (
                <div
                  key={alarm.id}
                  className={`border p-2.5 rounded-[6px] bg-[#0c0c0c] flex items-center justify-between gap-2 ${
                    alarm.armed ? "border-[#ffcc00]/60" : "border-[#ffcc00]/20 opacity-60"
                  }`}
                >
                  <div>
                    <div className="text-[11px] font-black tracking-wider truncate max-w-[150px]">
                      {alarm.label}
                    </div>
                    <div className="text-[26px] font-black leading-none mt-1 text-[#ffcc00]">
                      {displayH}:{displayM}
                      <span className="text-[10px] font-normal opacity-60 ml-2">ICT</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleToggleAlarm(alarm.id)}
                      className={`text-[10px] font-black px-2.5 py-1.5 rounded border transition-colors cursor-pointer ${
                        alarm.armed
                          ? "bg-[#ffcc00] text-black border-[#ffcc00]"
                          : "bg-black text-[#ffcc00]/50 border-[#ffcc00]/30"
                      }`}
                    >
                      {alarm.armed ? "ARMED" : "DISARMED"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPickerModal({
                          open: true,
                          mode: "alarm",
                          targetId: alarm.id,
                          initialValues: { hours: alarm.hour, minutes: alarm.minute, seconds: 0 },
                        })
                      }
                      className="bg-black text-[#ffcc00]/80 border border-[#ffcc00]/30 text-[10px] px-2 py-1.5 rounded hover:border-[#ffcc00] cursor-pointer"
                    >
                      EDIT
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteAlarm(alarm.id)}
                      className="bg-black text-red-400 border border-red-500/30 text-[10px] px-2 py-1.5 rounded hover:bg-red-950/40 cursor-pointer"
                    >
                      DEL
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* TACTICAL AUDIO MATRIX & PREFERENCES */}
        <section className="border border-[#ffcc00]/30 p-3 rounded-[8px] bg-black">
          <h3 className="text-[11px] font-black tracking-[0.25em] text-[#ffcc00]/80 mb-2">
            TACTICAL AUDIO MATRIX & SETTINGS
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Zero Sound Selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold tracking-wider opacity-70">
                CRISIS DETONATION SOUND (AT 00:00):
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {(Object.keys(ZERO_SOUND_LABELS) as ZeroSoundType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setZeroSound(type);
                      handleTestZeroSound(type);
                    }}
                    className={`text-[9px] font-bold p-2 rounded border text-left truncate transition-colors cursor-pointer ${
                      zeroSound === type
                        ? "bg-[#ffcc00] text-black border-[#ffcc00]"
                        : "bg-black text-[#ffcc00]/70 border-[#ffcc00]/30 hover:border-[#ffcc00]"
                    }`}
                  >
                    {ZERO_SOUND_LABELS[type]}
                  </button>
                ))}
              </div>
            </div>

            {/* Volume Control */}
            <div className="flex flex-col gap-1.5 justify-center">
              <div className="flex justify-between items-center text-[10px] font-bold">
                <span>TERMINAL MASTER GAIN:</span>
                <span className="text-[#ffcc00]">{audioVolume}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={audioVolume}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setAudioVolume(val);
                  if (audioRef.current) {
                    audioRef.current.setMasterVolume(val / 100);
                  }
                }}
                className="w-full"
              />
              <div className="flex justify-between items-center text-[9px] opacity-60">
                <span>0 (STEALTH)</span>
                <span>100 (HIGH IMPACT)</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* FULLSCREEN COUNTDOWN TAKEOVER (10S TO 00S) */}
      {isTakeover && primaryTimer && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4">
          <div className="text-[14px] md:text-[18px] tracking-[0.5em] text-red-500 font-black mb-2 animate-pulse">
            CRITICAL TIMELOCK ENGAGED
          </div>
          <div className="text-[11px] tracking-[0.3em] text-[#ffcc00]/70 mb-4">
            {primaryTimer.label}
          </div>
          <div
            className={`font-black leading-none ${
              isIntenseShake ? "ctu-shake-intense text-red-500" : "text-[#ffcc00]"
            }`}
            style={{ fontSize: "clamp(80px, 24vw, 220px)" }}
          >
            {formatHms(primaryTimer.remainingSec)}
          </div>

          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={() => handlePauseTimer(primaryTimer.id)}
              className="bg-red-600 hover:bg-red-700 text-white font-black px-6 py-3 rounded text-[14px] tracking-[0.2em] cursor-pointer"
            >
              ABORT OPERATION
            </button>
          </div>
        </div>
      )}

      {/* 24 OPENING VIDEO MODAL */}
      {activeVideoModal === "opening" && (
        <div
          role="dialog"
          aria-label="24 Opening Sequence"
          className="fixed inset-0 z-[10000] bg-black flex flex-col justify-between overflow-hidden"
        >
          {/* TOP TACTICAL CONTROL BAR */}
          <div className="h-[48px] border-b border-white/10 flex items-center justify-between px-3 md:px-5 bg-black shrink-0 z-20">
            <div className="flex items-center gap-3">
              <div className="text-[10px] md:text-[11px] tracking-[0.35em] text-[#ffcc00] font-black">
                24 // OPENING SEQUENCE // {liveTime}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-2 mr-2 text-[8px] md:text-[9px] tracking-[0.2em] text-[#ffcc00]/70">
                <span className="w-2 h-2 rounded-full bg-[#ffcc00] animate-ping" />
                <span>DIRECT FEED</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveVideoModal(null)}
                aria-label="Close Opening Video"
                className="min-h-[32px] px-3 md:px-4 border border-[#ffcc00] text-[10px] md:text-[11px] tracking-[0.2em] font-black rounded bg-[#ffcc00] text-black hover:bg-black hover:text-[#ffcc00] transition-colors cursor-pointer"
              >
                CLOSE [ESC]
              </button>
            </div>
          </div>

          {/* VIDEO CONTAINER */}
          <div className="relative flex-1 w-full bg-black flex items-center justify-center overflow-hidden">
            <div className="relative w-full max-w-[960px] aspect-[16/10] max-h-[82vh] overflow-hidden bg-black border-l-[10px] border-[#ff0000] shadow-[0_0_50px_rgba(255,204,0,0.15)] flex items-center justify-center">
              <video
                src="/24 Opening.mp4"
                autoPlay
                playsInline
                controls
                onEnded={() => setActiveVideoModal(null)}
                className="w-full h-full object-cover scale-[1.05] -translate-x-[2%]"
                style={{ imageRendering: "auto" }}
              />
              <div className="absolute inset-0 pointer-events-none bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.18)_2px,rgba(0,0,0,0.18)_4px)]" />
              <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_80px_rgba(0,0,0,0.85)]" />
            </div>
          </div>

          {/* BOTTOM TELEMETRY BAR */}
          <div className="h-[36px] border-t border-white/10 flex items-center justify-between px-3 md:px-5 bg-black text-[9px] md:text-[10px] tracking-[0.25em] text-[#ffcc00]/70 shrink-0 z-20 font-bold">
            <span className="truncate">SEC-OP // PROTOCOL ALPHA-6</span>
            <span className="opacity-60 hidden sm:inline">CTU LOS ANGELES DIVISION</span>
            <span>FEED: LIVE</span>
          </div>
        </div>
      )}

      {/* 24 ENDING CREDITS MODAL */}
      {activeVideoModal === "credits" && (
        <div
          role="dialog"
          aria-label="24 Ending Credits"
          className="fixed inset-0 z-[10000] bg-black flex flex-col justify-between overflow-hidden"
        >
          {/* AUDIO ELEMENT */}
          {creditsMusicOn && (
            <audio
              src="/24 Closing.mp4"
              autoPlay
              loop
              onPlay={() => console.log("Ending credits audio active")}
            />
          )}

          {/* TOP TACTICAL CONTROL BAR */}
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
                {creditsMusicOn ? "MUSIC ON" : "MUSIC MUTED"}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setCreditsViewMode((prev) => (prev === "watercolors" ? "video" : "watercolors"))
                }
                className="min-h-[32px] px-2.5 md:px-3 border border-[#ffcc00]/60 text-[9px] md:text-[10px] tracking-[0.2em] font-bold rounded bg-[#ffcc00]/10 text-[#ffcc00] hover:bg-[#ffcc00] hover:text-black transition-colors cursor-pointer"
              >
                {creditsViewMode === "watercolors" ? "VIEW ORIGINAL VIDEO" : "VIEW 32 WATERCOLORS"}
              </button>
              <button
                type="button"
                onClick={() => setActiveVideoModal(null)}
                aria-label="Close Ending Credits"
                className="min-h-[32px] px-3 md:px-4 border border-[#ffcc00] text-[10px] md:text-[11px] tracking-[0.2em] font-black rounded bg-[#ffcc00] text-black hover:bg-black hover:text-[#ffcc00] transition-colors cursor-pointer"
              >
                CLOSE [ESC]
              </button>
            </div>
          </div>

          {/* CONTENT: VIDEO OR WATERCOLOR SPLIT-SCREEN */}
          {creditsViewMode === "video" ? (
            <div className="relative flex-1 w-full bg-black flex items-center justify-center overflow-hidden">
              <div className="relative w-full max-w-[960px] aspect-[16/10] max-h-[82vh] overflow-hidden bg-black border-l-[10px] border-[#ff0000] shadow-[0_0_50px_rgba(255,204,0,0.15)] flex items-center justify-center">
                <video
                  src="/24 Closing.mp4"
                  autoPlay
                  playsInline
                  controls
                  onEnded={() => setActiveVideoModal(null)}
                  className="w-full h-full object-cover scale-[1.05] -translate-x-[2%]"
                />
                <div className="absolute inset-0 pointer-events-none bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.18)_2px,rgba(0,0,0,0.18)_4px)]" />
                <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_80px_rgba(0,0,0,0.85)]" />
              </div>
            </div>
          ) : (
            <div className="relative flex-1 w-full bg-black flex flex-col justify-between overflow-hidden">
              {/* TACTICAL 5-FRAME SURVEILLANCE GRID */}
              <div className="w-full max-w-[1200px] mx-auto flex-1 p-2 md:p-3 grid grid-cols-3 grid-rows-2 gap-1.5 md:gap-2 max-h-[62vh]">
                {/* Box 1 (Top Left) */}
                <div className="relative border border-white/20 overflow-hidden bg-black">
                  <img
                    src={WATERCOLOR_IMAGES[(creditsStep + 0) % WATERCOLOR_IMAGES.length]}
                    alt="Tactical Surveillance 1"
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

                {/* Box 2 (Top Center) */}
                <div className="relative border border-white/20 overflow-hidden bg-black">
                  <img
                    src={WATERCOLOR_IMAGES[(creditsStep + 7) % WATERCOLOR_IMAGES.length]}
                    alt="Tactical Surveillance 2"
                    className="absolute inset-0 w-full h-full object-cover ken watercolor scale-[1.08]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
                  <div className="absolute bottom-1 left-1 text-[7px] tracking-[0.3em] text-white/70 font-bold">
                    SATELLITE • SECTOR 4
                  </div>
                  <div className="absolute top-1 right-1 text-[#ffcc00] text-[8px] font-bold tracking-widest bg-black/70 px-1">
                    REC [●]
                  </div>
                </div>

                {/* Box 3 (Top Right) */}
                <div className="relative border border-white/20 overflow-hidden bg-black">
                  <img
                    src={WATERCOLOR_IMAGES[(creditsStep + 14) % WATERCOLOR_IMAGES.length]}
                    alt="Tactical Surveillance 3"
                    className="absolute inset-0 w-full h-full object-cover ken watercolor scale-[1.05]"
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
                    src={WATERCOLOR_IMAGES[(creditsStep + 18) % WATERCOLOR_IMAGES.length]}
                    alt="Tactical Surveillance 4 Exterior"
                    className="absolute inset-0 w-full h-full object-cover ken watercolor scale-[1.04]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                  <div className="absolute bottom-1 left-1 text-[8px] tracking-[0.3em] text-[#ffcc00] font-black bg-black/80 px-1.5 py-0.5">
                    CTU HEADQUARTERS • {creditsHours.start} - {creditsHours.end}
                  </div>

                  {/* Tactical Inset Box */}
                  <div className="absolute top-2 right-2 w-[34%] aspect-[16/10] border-2 border-[#ffcc00]/70 overflow-hidden bg-black shadow-[0_0_12px_rgba(0,0,0,0.8)]">
                    <img
                      src={WATERCOLOR_IMAGES[(creditsStep + 2) % WATERCOLOR_IMAGES.length]}
                      alt="Tactical Inset"
                      className="w-full h-full object-cover ken watercolor scale-[1.1]"
                    />
                    <div className="absolute bottom-0 inset-x-0 bg-black/85 text-[6px] tracking-[0.2em] text-[#ffcc00] px-1 py-0.5 text-center font-bold">
                      FEED // BAUER-01
                    </div>
                  </div>
                </div>

                {/* Box 5 (Bottom Right) */}
                <div className="relative border border-white/20 overflow-hidden bg-black">
                  <img
                    src={WATERCOLOR_IMAGES[(creditsStep + 25) % WATERCOLOR_IMAGES.length]}
                    alt="Tactical Surveillance 5"
                    className="absolute inset-0 w-full h-full object-cover ken watercolor scale-[1.06]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
                  <div className="absolute bottom-1 left-1 text-[7px] tracking-[0.3em] text-white/70 font-bold">
                    TACTICAL UNIT // CONVOY
                  </div>
                  <div className="absolute top-1 right-1 text-[7px] tracking-widest text-[#ffcc00]/80">
                    SIG: 99.8%
                  </div>
                </div>
              </div>

              {/* AUTHENTIC 24 ROLLING AMBER CREDITS CONTAINER */}
              <div className="relative w-full h-[32vh] max-h-[220px] bg-black border-t border-[#ffcc00]/30 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-black pointer-events-none z-10" />

                <div
                  className="w-full text-center text-[#ffcc00] font-bold text-[11px] md:text-[13px] leading-relaxed tracking-[0.25em]"
                  style={{ animation: "creditsRoll 62s linear infinite" }}
                >
                  <div className="py-2 text-[15px] md:text-[18px] font-black tracking-[0.35em] text-[#ffcc00] glow">
                    TWENTY FOUR
                  </div>
                  <div className="opacity-80 py-1">CREATED BY JOEL SURNOW & ROBERT COCHRAN</div>
                  <div className="opacity-70 py-1">STARRING KIEFER SUTHERLAND AS JACK BAUER</div>
                  <div className="opacity-70 py-1">LESLIE HOPE • SARAH CLARKE • ELISHA CUTHBERT</div>
                  <div className="opacity-70 py-1">DENNIS HAYSBERT AS SENATOR DAVID PALMER</div>
                  <div className="opacity-70 py-1">CARLOS BERNARD • PENNY JOHNSON JERALD</div>
                  <div className="opacity-70 py-1">MUSIC BY SEAN CALLERY</div>
                  <div className="opacity-60 py-1">CO-EXECUTIVE PRODUCER MICHAEL LOCEFF</div>
                  <div className="opacity-60 py-1">DIRECTED BY STEPHEN HOPKINS & JON CASSER</div>
                  <div className="opacity-60 py-1">PRODUCED IN ASSOCIATION WITH IMAGINE TELEVISION</div>
                  <div className="opacity-60 py-1">20TH CENTURY FOX TELEVISION</div>
                  <div className="py-2 text-[10px] tracking-[0.3em] text-[#ffcc00]/60">
                    ALL EVENTS OCCUR IN REAL TIME // ASIA/BANGKOK THEATER
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* BOTTOM TELEMETRY BAR */}
          <div className="h-[36px] border-t border-white/10 flex items-center justify-between px-3 md:px-5 bg-black text-[9px] md:text-[10px] tracking-[0.25em] text-[#ffcc00]/70 shrink-0 z-20 font-bold">
            <span className="truncate">
              THE FOLLOWING EVENTS TAKE PLACE BETWEEN {creditsHours.start} AND {creditsHours.end}
            </span>
            <span className="opacity-60 hidden sm:inline">CTU ARCHIVES // 32 SATELLITE PLATES</span>
            <span>END OF HOUR // {creditsHours.endOfHour}</span>
          </div>
        </div>
      )}

      {/* SAMSUNG-STYLE TIME & ALARM PICKER MODAL */}
      <SamsungTimePicker
        open={pickerModal.open}
        mode={pickerModal.mode}
        initialValues={pickerModal.initialValues}
        onConfirm={handlePickerConfirm}
        onCancel={() => setPickerModal((prev) => ({ ...prev, open: false }))}
      />

      {/* TACTICAL TOAST POPUP */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[20000] bg-black border-2 border-[#ffcc00] text-[#ffcc00] px-5 py-2.5 rounded-full font-black text-[12px] tracking-[0.2em] shadow-[0_0_24px_rgba(255,204,0,0.5)]">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
