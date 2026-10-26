// src/routes/index.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Globe,
  Maximize2,
  Minimize2,
  Moon,
  Pause,
  Pin,
  Play,
  Plus,
  RotateCcw,
  Shield,
  ShieldCheck,
  Square,
  Timer,
  Volume2,
  VolumeX,
  X,
  Zap,
  Film,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CTUDigits } from "@/components/ctu-digits";
import {
  SamsungTimePicker,
  SamsungTimerValues,
} from "@/components/samsung-time-picker";
import { useMissions } from "@/hooks/use-missions";
import {
  clockParts,
  focusMission,
  nextAlarm,
  remainingMs,
} from "@/lib/mission-engine";
import surveillance from "@/assets/la-surveillance.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        name: "description",
        content:
          "24-themed tactical mission timer and multi-alarm terminal. Drift-free real-time background execution, Zulu synchronization, and threat condition matrix.",
      },
      { property: "og:title", content: "CTU Operational Timer · 24 Terminal" },
      {
        property: "og:description",
        content:
          "Events occur in real time. Tactical countdown and daily alarm console with amber phosphor aesthetics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CTUTerminal,
});

export const TIMEZONE_SECTORS = [
  { id: "Asia/Bangkok", label: "BANGKOK · SECTOR 7 (UTC+7)" },
  { id: "America/Los_Angeles", label: "LOS ANGELES · CTU HQ (UTC-7)" },
  { id: "America/New_York", label: "WASHINGTON D.C. (UTC-4)" },
  { id: "Europe/London", label: "LONDON · MI6 LINK (UTC+1)" },
  { id: "Asia/Tokyo", label: "TOKYO · PACIFIC RIM (UTC+9)" },
  { id: "UTC", label: "ZULU / PRIME MERIDIAN (UTC+0)" },
] as const;

function getTzOffsetMs(date: Date, tz: string): number {
  try {
    const utcDate = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
    const tzDate = new Date(date.toLocaleString("en-US", { timeZone: tz }));
    return tzDate.getTime() - utcDate.getTime();
  } catch {
    return 0;
  }
}

type SurveillanceChannel = "auto" | "opening" | "countdown" | "closing" | "sat";

function CTUTerminal() {
  const {
    missions,
    presets,
    audio,
    arm,
    control,
    snooze,
    remove,
    togglePin,
    setAudioVolume,
    setAudioWindow,
    toggleAudio,
    testAlert,
    now,
  } = useMissions();

  // Settings & display state
  const [format24, setFormat24] = useState<boolean>(true);
  const [stealth, setStealth] = useState<boolean>(false);
  const [timeZone, setTimeZone] = useState<string>("Asia/Bangkok");
  const [fullscreen, setFullscreen] = useState<boolean>(false);
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);

  // Surveillance feed channel state
  const [activeChannel, setActiveChannel] = useState<SurveillanceChannel>("auto");
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Arm modal state
  const [addOpen, setAddOpen] = useState<boolean>(false);
  const [kind, setKind] = useState<"timer" | "alarm">("timer");
  const [title, setTitle] = useState<string>("");
  const [timerValues, setTimerValues] = useState<SamsungTimerValues>({
    hours: 0,
    minutes: 25,
    seconds: 0,
    totalSeconds: 1500,
  });
  const [alarmTime, setAlarmTime] = useState<string>("09:00:00");

  // Load client-persisted preferences once on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ctu-settings-v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.format24 === "boolean") setFormat24(parsed.format24);
        if (typeof parsed.stealth === "boolean") setStealth(parsed.stealth);
        if (typeof parsed.timeZone === "string") setTimeZone(parsed.timeZone);
      }
    } catch {
      /* ignore storage read error */
    }
  }, []);

  // Persist preferences on change
  useEffect(() => {
    try {
      localStorage.setItem(
        "ctu-settings-v1",
        JSON.stringify({ format24, stealth, timeZone }),
      );
    } catch {
      /* ignore */
    }
  }, [format24, stealth, timeZone]);

  // Request WakeLock to keep screen on (critical for operations)
  useEffect(() => {
    if ("wakeLock" in navigator) {
      navigator.wakeLock
        .request("screen")
        .then((sentinel) => setWakeLock(sentinel))
        .catch(() => {});
    }
    return () => {
      wakeLock?.release().catch(() => {});
    };
  }, []);

  // Current active focus mission
  const activeFocus = useMemo(() => focusMission(missions, now), [missions, now]);

  const crisis = useMemo(
    () => missions.some((m) => m.status === "CRISIS"),
    [missions],
  );

  const closestRemaining = useMemo(() => {
    if (!activeFocus) return Infinity;
    return remainingMs(activeFocus, now);
  }, [activeFocus, now]);

  const threatState = useMemo<"nominal" | "warning" | "crisis">(() => {
    if (crisis) return "crisis";
    if (closestRemaining <= 300000 && closestRemaining > 0) return "warning";
    return "nominal";
  }, [crisis, closestRemaining]);

  const inCountdownWindow = useMemo(
    () => closestRemaining <= audio.countdownWindow * 1000 && closestRemaining > 0,
    [closestRemaining, audio.countdownWindow],
  );

  // Resolved channel considering automatic operational triggers
  const resolvedChannel = useMemo<"opening" | "countdown" | "closing" | "sat">(() => {
    if (activeChannel !== "auto") return activeChannel;
    if (crisis) return "closing";
    if (inCountdownWindow) return "countdown";
    if (activeFocus && activeFocus.status === "ACTIVE") {
      const elapsed = now - (activeFocus.startedAt || 0);
      if (elapsed >= 0 && elapsed <= 35000) return "opening";
    }
    return "sat";
  }, [activeChannel, crisis, inCountdownWindow, activeFocus, now]);

  // Local Theater Clock
  const localClock = useMemo(() => {
    const tzOffset = getTzOffsetMs(new Date(now), timeZone);
    const tzDate = new Date(now + tzOffset);

    let h = tzDate.getUTCHours();
    const m = String(tzDate.getUTCMinutes()).padStart(2, "0");
    const s = String(tzDate.getUTCSeconds()).padStart(2, "0");

    let period = "";
    if (!format24) {
      period = h >= 12 ? "PM" : "AM";
      h = h % 12 || 12;
    }
    const hStr = String(h).padStart(2, "0");
    return {
      digits: `${hStr}:${m}:${s}`,
      period,
      h: hStr,
      m,
      s,
    };
  }, [now, timeZone, format24]);

  // Zulu UTC Clock
  const zuluClock = useMemo(() => {
    const d = new Date(now);
    const h = String(d.getUTCHours()).padStart(2, "0");
    const m = String(d.getUTCMinutes()).padStart(2, "0");
    const s = String(d.getUTCSeconds()).padStart(2, "0");
    return `${h}:${m}:${s}Z`;
  }, [now]);

  // Active Focus Countdown digits
  const focusDigits = useMemo(() => {
    if (!activeFocus) return "00:00:00";
    const rem = remainingMs(activeFocus, now);
    return clockParts(rem);
  }, [activeFocus, now]);

  const focusProgress = useMemo(() => {
    if (!activeFocus || !activeFocus.durationMs || activeFocus.durationMs <= 0)
      return 0;
    const rem = remainingMs(activeFocus, now);
    return Math.max(0, Math.min(100, 100 - (rem / activeFocus.durationMs) * 100));
  }, [activeFocus, now]);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setFullscreen(false);
    }
  }, []);

  const handleArmSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const finalTitle =
        title.trim() ||
        (kind === "timer" ? "Tactical Operation" : "Daily Checkpoint");

      if (kind === "timer") {
        const durationMs = timerValues.totalSeconds * 1000;
        if (durationMs <= 0) return;
        arm({
          title: finalTitle,
          kind: "timer",
          durationMs,
        });
      } else {
        const parts = alarmTime.split(":").map(Number);
        const alarmH = parts[0] ?? 9;
        const alarmM = parts[1] ?? 0;
        const alarmS = parts[2] ?? 0;

        const tzOffset = getTzOffsetMs(new Date(now), timeZone);
        const theaterNow = now + tzOffset;
        const targetTheaterTime = nextAlarm(
          `${String(alarmH).padStart(2, "0")}:${String(alarmM).padStart(2, "0")}:${String(alarmS).padStart(2, "0")}`,
          theaterNow,
        );

        const durationMs = Math.max(1000, targetTheaterTime - theaterNow);

        arm({
          title: finalTitle,
          kind: "alarm",
          alarmTime,
          durationMs,
        });
      }

      setAddOpen(false);
      setTitle("");
      // When newly arming, auto channel switches smoothly to Opening
      if (activeChannel === "auto") {
        setActiveChannel("opening");
      }
    },
    [kind, title, timerValues, alarmTime, arm, now, timeZone, activeChannel],
  );

  const threatClass =
    threatState === "crisis"
      ? "threat-crisis"
      : threatState === "warning"
        ? "threat-warning"
        : stealth
          ? "stealth-state"
          : "amber-state";

  // Channel-specific metadata
  const channelMeta = useMemo(() => {
    switch (resolvedChannel) {
      case "opening":
        return {
          title: "CAM-01 · 24 OPENING PROTOCOL",
          status: "INFILTRATION / MISSION INITIATION",
          footer: "SOURCE: 24 OPENING · SYNC AUDIO",
          src: "/24 Opening.mp4",
          isVideo: true,
        };
      case "countdown":
        return {
          title: "CAM-24 · 24 COUNTDOWN TITLES",
          status: "CRITICAL COUNTDOWN APPROACH",
          footer: "SOURCE: 24 COUNTDOWN · SYNC AUDIO",
          src: "/24 Countdown.mp4",
          isVideo: true,
        };
      case "closing":
        return {
          title: "CAM-99 · 24 EPISODE CLOSING",
          status: crisis ? "24 AT ZERO · CODE RED" : "OPERATION STAND-DOWN",
          footer: "SOURCE: 24 CLOSING · SYNC AUDIO",
          src: "/24 Closing.mp4",
          isVideo: true,
        };
      case "sat":
      default:
        return {
          title: "SAT-LINK 04 · SECTOR 7 RECON",
          status: "SIGNAL: 98.4% NOMINAL",
          footer: "GRID: 34.0522° N, 118.2437° W",
          src: surveillance,
          isVideo: false,
        };
    }
  }, [resolvedChannel, crisis]);

  return (
    <div className={`ctu-terminal min-h-screen ${threatClass}`}>
      {/* Top Banner / Global CTU Header */}
      <header className="ctu-header">
        <div className="header-left">
          <div className="ctu-badge-giant font-title">24</div>
          <div className="ctu-meta-block">
            <span className="ctu-org">CTU · COUNTER TERRORIST UNIT</span>
            <span className="ctu-subhead">
              TACTICAL OPERATIONS COMMAND · DIVISION 1
            </span>
          </div>
        </div>

        <div className="header-right">
          {/* Audio State Toggle */}
          <button
            type="button"
            onClick={toggleAudio}
            className={`tactical-pill flex items-center gap-1.5 ${
              audio.enabled ? "tactical-pill-active" : ""
            }`}
            title="Toggle synthesized audio output"
          >
            {audio.enabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
            <span>AUDIO: {audio.enabled ? "ACTIVE" : "MUTED"}</span>
          </button>

          {/* Zulu Time Pill */}
          <div className="tactical-pill hidden sm:flex items-center gap-1.5">
            <Globe size={13} />
            <span>ZULU: {zuluClock}</span>
          </div>

          {/* Stealth Mode */}
          <button
            type="button"
            onClick={() => setStealth((v) => !v)}
            className={`tactical-pill ${stealth ? "tactical-pill-active" : ""}`}
            title="Toggle Night Phosphor Stealth Mode"
          >
            <Moon size={13} />
            <span className="hidden md:inline">STEALTH</span>
          </button>

          {/* Fullscreen */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="tactical-pill"
            title="Toggle Fullscreen"
          >
            {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </header>

      {/* Main Terminal Viewport */}
      <main className="terminal-body operations-layout">
        {/* Left Column: Primary Operation Center */}
        <section className="primary-column">
          {/* THE UNIFIED COMMAND DECK: Local Mission Clock + Active Operation Countdown */}
          <section className="terminal-panel unified-command-stage">
            <div className="panel-heading flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="live-indicator" />
                <span className="tracking-widest">
                  PRIMARY TACTICAL DISPLAY · REAL-TIME STAGE
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* 12h/24h toggle */}
                <button
                  type="button"
                  onClick={() => setFormat24((v) => !v)}
                  className="stage-btn-mini"
                  title="Toggle 12H / 24H Format"
                >
                  {format24 ? "24H FORMAT" : "12H FORMAT"}
                </button>
              </div>
            </div>

            <div className="stage-dual-grid">
              {/* Sector A: Local Mission Time */}
              <div className="stage-sector stage-sector-clock">
                <div className="sector-tag flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Globe size={11} />
                    LOCAL MISSION TIME
                  </span>

                  {/* Theater selector */}
                  <select
                    value={timeZone}
                    onChange={(e) => setTimeZone(e.target.value)}
                    className="stage-tz-select"
                  >
                    {TIMEZONE_SECTORS.map((sec) => (
                      <option key={sec.id} value={sec.id}>
                        {sec.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="stage-digits-container">
                  <CTUDigits time={localClock.digits} size="xl" />
                  {!format24 && (
                    <span className="stage-ampm font-mono text-xs text-[var(--signal)] ml-2">
                      {localClock.period}
                    </span>
                  )}
                </div>

                <div className="stage-meta-row flex justify-between text-[11px] font-mono text-[var(--signal)]/80 mt-1">
                  <span>THEATER: {timeZone.split("/")[1]?.replace("_", " ") || "BANGKOK"}</span>
                  <span>SYNC: REAL-TIME SECONDS</span>
                </div>
              </div>

              {/* Sector B: Active Mission Countdown Focus */}
              <div className="stage-sector stage-sector-operation">
                <div className="sector-tag flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Shield size={11} />
                    ACTIVE OPERATION COUNTDOWN
                  </span>
                  <span className="text-[10px] text-[var(--signal)]">
                    {activeFocus
                      ? activeFocus.pinned
                        ? "MANUAL PIN LOCK"
                        : "CLOSEST THREAT"
                      : "STANDBY"}
                  </span>
                </div>

                <div className="stage-digits-container">
                  <CTUDigits time={focusDigits} size="xl" />
                </div>

                <div className="stage-meta-row flex items-center justify-between text-[11px] font-mono text-[var(--signal)]/80 mt-1">
                  <span className="truncate max-w-[200px]">
                    {activeFocus ? activeFocus.title.toUpperCase() : "NO ACTIVE OPERATION"}
                  </span>
                  <span>
                    {activeFocus
                      ? activeFocus.kind === "alarm"
                        ? `ALARM @ ${activeFocus.alarmTime || "--:--:--"}`
                        : `${Math.round(focusProgress)}% COMPLETE`
                      : "ALL SECTORS SECURE"}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="stage-progress-bar mt-2">
                  <div
                    className="stage-progress-fill"
                    style={{ width: `${focusProgress}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Stage Quick Controls */}
            {activeFocus && (
              <div className="stage-controls-bar flex items-center justify-between p-2 border-t border-[var(--border-amber)]">
                <div className="flex items-center gap-2">
                  {activeFocus.status === "ACTIVE" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => control(activeFocus.id, "pause")}
                      className="tactical-btn"
                    >
                      <Pause size={12} className="mr-1" /> PAUSE OPERATION
                    </Button>
                  ) : activeFocus.status === "PAUSED" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => control(activeFocus.id, "start")}
                      className="tactical-btn text-green-400"
                    >
                      <Play size={12} className="mr-1" /> RESUME OPERATION
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => snooze(activeFocus.id)}
                      className="tactical-btn text-yellow-400"
                    >
                      <RotateCcw size={12} className="mr-1" /> SNOOZE (+9M)
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => control(activeFocus.id, "reset")}
                    className="tactical-btn"
                  >
                    <RotateCcw size={12} className="mr-1" /> RESET
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => togglePin(activeFocus.id)}
                    className={`tactical-btn ${activeFocus.pinned ? "text-amber-400" : ""}`}
                  >
                    <Pin size={12} className="mr-1" /> {activeFocus.pinned ? "PINNED" : "PIN"}
                  </Button>
                </div>

                <div className="text-[11px] font-mono text-[var(--signal)]">
                  STATUS: <strong>{activeFocus.status}</strong>
                </div>
              </div>
            )}
          </section>

          {/* Quick-Arm Tactical Presets */}
          <section className="terminal-panel mt-3 presets-deck">
            <div className="panel-heading flex items-center justify-between">
              <span>QUICK-ARM PROTOCOLS</span>
              <span className="text-[10px] text-neutral-400">ONE-TOUCH DEPLOYMENT</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    arm({
                      title: preset.title,
                      kind: preset.kind,
                      durationMs: preset.durationMs,
                    });
                    if (activeChannel === "auto") {
                      setActiveChannel("opening");
                    }
                  }}
                  className="preset-tactical-tile p-2.5 text-left border border-[var(--border-amber)] hover:bg-[var(--border-amber)]/20 transition-colors"
                >
                  <div className="text-[10px] font-mono text-amber-500/80">
                    {preset.kind === "alarm" ? "DAILY ALARM" : "COUNTDOWN"}
                  </div>
                  <div className="font-bold text-xs truncate text-[var(--signal)]">
                    {preset.title}
                  </div>
                  <div className="text-[11px] font-mono text-neutral-300 mt-1">
                    {preset.kind === "alarm"
                      ? preset.alarmTime
                      : `${Math.round(preset.durationMs / 60000)} MIN`}
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Active Missions Queue */}
          <section className="terminal-panel mt-3 queue-deck">
            <div className="panel-heading flex items-center justify-between">
              <span>ACTIVE OPERATIONS QUEUE ({missions.length})</span>
              <Button
                size="sm"
                onClick={() => setAddOpen(true)}
                className="arm-action-btn flex items-center gap-1 text-xs"
              >
                <Plus size={13} /> ARM OPERATION
              </Button>
            </div>

            <div className="queue-list p-2 space-y-2">
              {missions.length === 0 ? (
                <div className="p-4 text-center text-xs font-mono text-neutral-400">
                  NO ACTIVE MISSIONS IN THEATER. USE QUICK-ARM OR "ARM OPERATION".
                </div>
              ) : (
                missions.map((m) => {
                  const rem = remainingMs(m, now);
                  const isCurrent = activeFocus?.id === m.id;
                  return (
                    <div
                      key={m.id}
                      className={`queue-item p-2 border ${
                        isCurrent
                          ? "border-[var(--signal)] bg-[var(--border-amber)]/10"
                          : "border-neutral-800"
                      } flex items-center justify-between`}
                    >
                      <div className="flex items-center gap-2">
                        {m.pinned && <Pin size={11} className="text-amber-400" />}
                        <div>
                          <div className="font-bold text-xs text-[var(--signal)]">
                            {m.title}
                          </div>
                          <div className="text-[10px] font-mono text-neutral-400">
                            {m.kind.toUpperCase()} · STATUS: {m.status}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm text-[var(--signal)]">
                          {clockParts(rem)}
                        </span>
                        <div className="flex items-center gap-1">
                          {m.status === "ACTIVE" ? (
                            <button
                              type="button"
                              className="q-act-btn"
                              onClick={() => control(m.id, "pause")}
                            >
                              <Pause size={12} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="q-act-btn"
                              onClick={() => control(m.id, "start")}
                            >
                              <Play size={12} />
                            </button>
                          )}
                          <button
                            type="button"
                            className="q-act-btn"
                            onClick={() => togglePin(m.id)}
                          >
                            <Pin size={12} />
                          </button>
                          <button
                            type="button"
                            className="q-act-btn delete"
                            onClick={() => remove(m.id)}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </section>

        {/* Tactical Surveillance & Surveillance Column */}
        <aside className="secondary-column">
          {/* Tactical Surveillance & 24 Video Feeds (Opening / Countdown / Closing / Sat) */}
          <section className="terminal-panel surveillance-panel">
            <div className="panel-heading flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
              <span className="truncate">{channelMeta.title}</span>
              
              {/* Surveillance Channel Switcher Chips */}
              <div className="flex items-center gap-1 flex-wrap">
                {(["auto", "opening", "countdown", "closing", "sat"] as const).map(
                  (ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setActiveChannel(ch)}
                      className={`text-[9px] font-mono px-1.5 py-0.5 border cursor-pointer uppercase transition-colors ${
                        activeChannel === ch
                          ? "bg-[var(--signal)] text-black border-[var(--signal)] font-bold"
                          : "border-neutral-700 text-neutral-300 hover:border-amber-400"
                      }`}
                    >
                      [{ch}]
                    </button>
                  ),
                )}
              </div>
            </div>

            <div className="surveillance-frame relative bg-black overflow-hidden h-[220px]">
              {channelMeta.isVideo ? (
                <video
                  ref={videoRef}
                  key={channelMeta.src}
                  src={channelMeta.src}
                  autoPlay
                  loop
                  muted={!audio.enabled}
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <img
                  src={channelMeta.src}
                  alt="Watercolor aerial surveillance of downtown Los Angeles"
                  className="surveillance-img w-full h-full object-cover opacity-75"
                />
              )}

              <div className="surveillance-overlay pointer-events-none absolute inset-0">
                <div className="cam-tag">{channelMeta.title}</div>
                <div className="surveillance-reticle" />
                <div className="surveillance-footer">
                  <span>{channelMeta.footer}</span>
                  <span className="accent">{channelMeta.status}</span>
                </div>
              </div>
            </div>

            {/* Crisis Alert Banner */}
            {crisis && (
              <div className="p-2 bg-red-950/80 border-t border-red-500 text-red-200 text-xs font-mono flex items-center justify-between">
                <span>🚨 24 AT ZERO · CODE RED ACTIVE</span>
                <button
                  type="button"
                  onClick={() => {
                    missions
                      .filter((m) => m.status === "CRISIS")
                      .forEach((m) => control(m.id, "stop"));
                  }}
                  className="px-2 py-0.5 bg-red-700 text-white uppercase text-[10px] font-bold cursor-pointer"
                >
                  DISARM ALARM
                </button>
              </div>
            )}
          </section>

          {/* Audio Matrix & Multimedia Controls */}
          <section className="terminal-panel audio-panel mt-3">
            <div className="panel-heading flex items-center justify-between">
              <span>AUDIO MATRIX & MEDIA FEEDS</span>
              <button
                type="button"
                onClick={toggleAudio}
                className="text-[10px] text-[var(--signal)] underline cursor-pointer"
              >
                {audio.enabled ? "MUTE" : "UNMUTE"}
              </button>
            </div>

            <div className="p-3 space-y-3">
              {/* Media Preview Triggers */}
              <div>
                <label className="text-[10px] font-mono text-neutral-300 block mb-1">
                  TACTICAL SURVEILLANCE FEED TRIGGERS
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveChannel("opening");
                      if (!audio.enabled) toggleAudio();
                    }}
                    className="tactical-btn text-[10px] flex items-center justify-center gap-1 py-1"
                  >
                    <Film size={11} /> 24 OPENING
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveChannel("countdown");
                      if (!audio.enabled) toggleAudio();
                    }}
                    className="tactical-btn text-[10px] flex items-center justify-center gap-1 py-1"
                  >
                    <Film size={11} /> 24 COUNTDOWN
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveChannel("closing");
                      if (!audio.enabled) toggleAudio();
                    }}
                    className="tactical-btn text-[10px] flex items-center justify-center gap-1 py-1"
                  >
                    <Film size={11} /> 24 CLOSING
                  </button>
                  <button
                    type="button"
                    onClick={() => testAlert()}
                    className="tactical-btn text-[10px] flex items-center justify-center gap-1 py-1 text-red-400"
                  >
                    <Zap size={11} /> ZERO THEME (MP3)
                  </button>
                </div>
              </div>

              {/* Master Volume */}
              <div>
                <div className="flex justify-between text-[11px] font-mono text-[var(--signal)] mb-1">
                  <span>MASTER CRISIS VOLUME</span>
                  <span>{audio.alarmVolume}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={audio.alarmVolume}
                  onChange={(e) => setAudioVolume(Number(e.target.value))}
                  className="w-full accent-[var(--signal)]"
                />
              </div>

              {/* Countdown Audio Window */}
              <div>
                <div className="flex justify-between text-[11px] font-mono text-[var(--signal)] mb-1">
                  <span>COUNTDOWN VIDEO/AUDIO WINDOW</span>
                  <span>{audio.countdownWindow} SECONDS</span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[10, 23, 30, 60].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setAudioWindow(sec)}
                      className={`text-[10px] font-mono py-1 border text-center ${
                        audio.countdownWindow === sec
                          ? "bg-[var(--signal)] text-black border-[var(--signal)] font-bold"
                          : "border-neutral-700 text-neutral-300"
                      }`}
                    >
                      {sec}S
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-[10px] text-neutral-400 pt-1 border-t border-neutral-900 leading-relaxed font-mono">
                • <strong>Opening:</strong> <code>public/24 Opening.mp4</code> (35s mission initiation)
                <br />• <strong>Countdown:</strong> <code>public/24 Countdown.mp4</code> (23s titles approaching zero)
                <br />• <strong>Closing:</strong> <code>public/24 Closing.mp4</code> (60s stand-down / at zero)
                <br />• <strong>Theme:</strong> <code>public/24 At Zero theme.mp3</code> (Code Red)
              </div>
            </div>
          </section>
        </aside>
      </main>

      {/* Arm Operation Modal (Samsung One UI Time Picker) */}
      {addOpen && (
        <div className="arm-modal-backdrop">
          <div className="arm-modal">
            <div className="arm-modal-header flex items-center justify-between">
              <span className="font-title tracking-wider text-base text-[var(--signal)]">
                ARM NEW OPERATION PROTOCOL
              </span>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="text-neutral-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {/* Mode selection tabs */}
            <div className="arm-modal-tabs grid grid-cols-2 gap-1 p-2 bg-black border-b border-neutral-800">
              <button
                type="button"
                className={`tab-btn flex items-center justify-center gap-1.5 py-1.5 text-xs font-mono font-bold ${
                  kind === "timer"
                    ? "bg-[var(--signal)] text-black"
                    : "text-neutral-400 border border-neutral-800"
                }`}
                onClick={() => setKind("timer")}
              >
                <Timer size={13} /> COUNTDOWN TIMER
              </button>
              <button
                type="button"
                className={`tab-btn flex items-center justify-center gap-1.5 py-1.5 text-xs font-mono font-bold ${
                  kind === "alarm"
                    ? "bg-[var(--signal)] text-black"
                    : "text-neutral-400 border border-neutral-800"
                }`}
                onClick={() => setKind("alarm")}
              >
                <Bell size={13} /> DAILY ALARM
              </button>
            </div>

            <form onSubmit={handleArmSubmit} className="p-4 space-y-4">
              <div>
                <label
                  htmlFor="mission-title"
                  className="text-[11px] font-mono text-[var(--signal)] block mb-1"
                >
                  OPERATION CODENAME / LABEL
                </label>
                <input
                  id="mission-title"
                  type="text"
                  placeholder={
                    kind === "timer" ? "Tactical Sprint" : "Daily SITREP Report"
                  }
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="arm-input w-full p-2 bg-neutral-950 border border-neutral-800 text-[var(--signal)] font-mono text-sm"
                />
              </div>

              {/* Samsung Galaxy One UI Drum Setter */}
              <div className="picker-wrapper py-2">
                <label className="text-[11px] font-mono text-neutral-400 block mb-2 text-center">
                  {kind === "timer"
                    ? "SET COUNTDOWN (HOURS : MINUTES : SECONDS)"
                    : `SET ALARM TIME (${timeZone.split("/")[1]?.replace("_", " ") || "THEATER"})`}
                </label>

                <SamsungTimePicker
                  mode={kind}
                  timerValues={timerValues}
                  onTimerChange={setTimerValues}
                  alarmTime={alarmTime}
                  onAlarmChange={setAlarmTime}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-900">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="px-3 py-1.5 text-xs font-mono text-neutral-400 hover:text-white"
                >
                  CANCEL
                </button>
                <Button
                  type="submit"
                  className="bg-[var(--signal)] text-black hover:bg-amber-400 font-bold font-mono text-xs px-4 py-1.5"
                >
                  DEPLOY OPERATION
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
