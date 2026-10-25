// src/routes/index.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [forceCountdownFeed, setForceCountdownFeed] = useState<boolean>(false);

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
      /* ignore storage write error */
    }
  }, [format24, stealth, timeZone]);

  // Derived tactical status
  const activeFocus = useMemo(() => focusMission(missions, now), [missions, now]);
  const crisis = useMemo(() => missions.some((m) => m.status === "CRISIS"), [missions]);

  const activeMissions = useMemo(
    () => missions.filter((m) => m.status === "ACTIVE"),
    [missions],
  );

  const closestRemaining = useMemo(() => {
    if (!activeMissions.length) return Infinity;
    return Math.min(...activeMissions.map((m) => remainingMs(m, now)));
  }, [activeMissions, now]);

  const heightened = useMemo(
    () => closestRemaining <= 5 * 60 * 1000 && closestRemaining > 0,
    [closestRemaining],
  );

  const inCountdownWindow = useMemo(
    () => closestRemaining <= audio.countdownWindow * 1000 && closestRemaining > 0,
    [closestRemaining, audio.countdownWindow],
  );

  const missionCount = missions.length;
  const activeCount = activeMissions.length;

  // Local Mission Clock digits
  const localClock = useMemo(() => {
    const ts = now || Date.now();
    try {
      const date = new Date(ts);
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour12: !format24,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).formatToParts(date);

      const h = parts.find((p) => p.type === "hour")?.value || "00";
      const m = parts.find((p) => p.type === "minute")?.value || "00";
      const s = parts.find((p) => p.type === "second")?.value || "00";
      const p = parts.find((p) => p.type === "dayPeriod")?.value || "";
      return {
        digits: `${h}:${m}:${s}`,
        period: format24 ? "" : p.toUpperCase(),
      };
    } catch {
      return {
        digits: clockParts(ts),
        period: "",
      };
    }
  }, [now, format24, timeZone]);

  // Zulu UTC Clock
  const zuluClock = useMemo(() => {
    const d = new Date(now || Date.now());
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

  // Active Operation progress %
  const focusProgress = useMemo(() => {
    if (!activeFocus || !activeFocus.durationMs || activeFocus.durationMs <= 0) return 0;
    const rem = remainingMs(activeFocus, now);
    return Math.max(0, Math.min(100, 100 - (rem / activeFocus.durationMs) * 100));
  }, [activeFocus, now]);

  // Arm submission handler
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
        const at = Date.now();
        const tzOffset = getTzOffsetMs(new Date(at), timeZone);
        const localNow = at + tzOffset;
        const targetLocal = nextAlarm(alarmTime, localNow);
        const durationMs = Math.max(1000, targetLocal - localNow);

        arm({
          title: finalTitle,
          kind: "alarm",
          durationMs,
          alarmTime,
        });
      }

      setTitle("");
      setAddOpen(false);
    },
    [title, kind, timerValues, alarmTime, arm, timeZone],
  );

  const handleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setFullscreen(true);
      } else {
        await document.exitFullscreen();
        setFullscreen(false);
      }
    } catch {
      /* fullscreen blocked */
    }
  };

  const handleWakeLock = async () => {
    if (wakeLock) {
      await wakeLock.release();
      setWakeLock(null);
    } else if ("wakeLock" in navigator) {
      try {
        const lock = await navigator.wakeLock.request("screen");
        setWakeLock(lock);
        lock.addEventListener("release", () => setWakeLock(null));
      } catch {
        /* wake lock rejected */
      }
    }
  };

  const threatClass = crisis
    ? "crisis-state"
    : heightened
      ? "heightened-state"
      : stealth
        ? "stealth-state"
        : "amber-state";

  const showCountdownVideo = inCountdownWindow || forceCountdownFeed || crisis;

  return (
    <div className={`ctu-terminal min-h-screen ${threatClass}`}>
      {/* Header telemetry bar */}
      <header className="terminal-header">
        <div className="ctu-brand">
          <div className="brand-logo">24</div>
          <div className="brand-telemetry">
            <div className="brand-title">CTU · COUNTER TERRORIST UNIT</div>
            <div className="brand-sub">TACTICAL OPERATIONS COMMAND · DEFCON 2</div>
          </div>
        </div>

        <div className="header-clocks">
          <div className="zulu-box">
            <span className="telemetry-label">ZULU SYNC</span>
            <span className="zulu-digits">{zuluClock}</span>
          </div>

          <div className="header-controls">
            <button
              type="button"
              className="ctrl-btn"
              onClick={() => setFormat24((v) => !v)}
              title="Toggle 24H / 12H display"
            >
              {format24 ? "24H" : "12H"}
            </button>
            <button
              type="button"
              className="ctrl-btn"
              onClick={() => setStealth((v) => !v)}
              title="Toggle Night Ops stealth phosphor"
            >
              <Moon size={13} />
            </button>
            <button
              type="button"
              className="ctrl-btn"
              onClick={handleFullscreen}
              title="Toggle Fullscreen"
            >
              {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
            <button
              type="button"
              className={`ctrl-btn ${wakeLock ? "active" : ""}`}
              onClick={handleWakeLock}
              title="Toggle Screen Wake Lock"
            >
              <ShieldCheck size={13} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Command Deck Grid */}
      <main className="operations-layout">
        {/* Primary Stage Column */}
        <section className="primary-column">
          <div className="unified-stage-panel">
            {/* Stage Header */}
            <div className="stage-top-bar flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="live-indicator-dot" />
                <span className="stage-title">PRIMARY OPERATIONS COMMAND DECK</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleAudio}
                  className={`time-mode-btn flex items-center gap-1.5 ${
                    audio.enabled
                      ? "border-[var(--signal)] text-[var(--signal)]"
                      : "text-muted-foreground opacity-80"
                  }`}
                >
                  {audio.enabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
                  <span>{audio.enabled ? "AUDIO ON" : "AUDIO MUTED"}</span>
                </button>
                <div className="flex items-center gap-1 bg-black/60 px-2 py-1 border border-border/50 text-[10px] tracking-wider">
                  <Globe size={11} className="text-[var(--signal)]" />
                  <select
                    value={timeZone}
                    onChange={(e) => setTimeZone(e.target.value)}
                    className="bg-transparent text-[var(--signal)] outline-none cursor-pointer uppercase font-mono text-[10px]"
                  >
                    {TIMEZONE_SECTORS.map((s) => (
                      <option key={s.id} value={s.id} className="bg-black text-[var(--signal)]">
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Split Dual-Stage: Local Mission Clock + Active Operation */}
            <div className="unified-stage-grid">
              {/* Sector A: Local Mission Real-Time Clock */}
              <div className="stage-sector stage-sector-local">
                <div className="sector-tag flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Globe size={12} className="text-[var(--signal)]" />
                    <span>LOCAL MISSION TIME</span>
                  </span>
                  <span className="text-[10px] opacity-75">
                    {timeZone.split("/")[1]?.replace("_", " ") ?? timeZone}{" "}
                    {localClock.period ? `(${localClock.period})` : ""}
                  </span>
                </div>
                <div className="clock-viewport">
                  <CTUDigits
                    time={localClock.digits}
                    className="mission-clock h-16 sm:h-20 lg:h-24"
                  />
                </div>
                <div className="sector-telemetry">
                  <span>STATUS: CONTINUOUS REAL-TIME LINK</span>
                  <span className="accent">EVENTS OCCUR IN REAL TIME</span>
                </div>
              </div>

              {/* Sector B: Active Mission Countdown Focus */}
              <div className="stage-sector stage-sector-operation">
                <div className="sector-tag flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Timer size={12} className="text-[var(--signal)]" />
                    <span>ACTIVE OPERATION FOCUS</span>
                  </span>
                  {activeFocus && (
                    <span className={`status-pill ${activeFocus.status.toLowerCase()}`}>
                      {activeFocus.status}
                    </span>
                  )}
                </div>

                <div className="clock-viewport">
                  {activeFocus ? (
                    <CTUDigits
                      time={focusDigits}
                      className="focus-clock h-16 sm:h-20 lg:h-24"
                    />
                  ) : (
                    <div className="standby-digits">00:00:00</div>
                  )}
                </div>

                <div className="operation-meta">
                  <div className="op-title-row">
                    <span className="op-title">
                      {activeFocus ? activeFocus.title : "NO ACTIVE OPERATION IN QUEUE"}
                    </span>
                    {activeFocus && (
                      <button
                        type="button"
                        className={`pin-btn ${activeFocus.pinned ? "pinned" : ""}`}
                        onClick={() => togglePin(activeFocus.id)}
                        title="Pin this operation to maintain primary focus"
                      >
                        <Pin size={12} />
                      </button>
                    )}
                  </div>

                  {activeFocus && (
                    <div className="progress-bar-rail">
                      <div
                        className="progress-bar-fill"
                        style={{ width: `${focusProgress}%` }}
                      />
                    </div>
                  )}

                  {/* Operation Controls */}
                  <div className="operation-controls">
                    {activeFocus ? (
                      <>
                        {activeFocus.status === "ACTIVE" ? (
                          <button
                            type="button"
                            className="control-btn pause"
                            onClick={() => control(activeFocus.id, "pause")}
                          >
                            <Pause size={13} /> PAUSE
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="control-btn resume"
                            onClick={() => control(activeFocus.id, "start")}
                          >
                            <Play size={13} /> RESUME
                          </button>
                        )}
                        <button
                          type="button"
                          className="control-btn reset"
                          onClick={() => control(activeFocus.id, "reset")}
                        >
                          <RotateCcw size={13} /> RESET
                        </button>
                        <button
                          type="button"
                          className="control-btn stop"
                          onClick={() => control(activeFocus.id, "stop")}
                        >
                          <Square size={13} /> STOP
                        </button>
                        {activeFocus.status === "CRISIS" && (
                          <button
                            type="button"
                            className="control-btn crisis-snooze"
                            onClick={() => snooze(activeFocus.id)}
                          >
                            <Zap size={13} /> SNOOZE (
                            {Math.floor(audio.snoozeMs / 60000)}M)
                          </button>
                        )}
                      </>
                    ) : (
                      <Button
                        type="button"
                        className="arm-callout-btn"
                        onClick={() => {
                          setKind("timer");
                          setAddOpen(true);
                        }}
                      >
                        <Plus size={14} /> ARM OPERATION
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Stage Quick-Arm Protocol Presets */}
            <div className="stage-presets-footer">
              <div className="presets-label">QUICK-ARM PROTOCOLS:</div>
              <div className="presets-row">
                {presets.slice(0, 4).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="preset-chip"
                    onClick={() =>
                      arm({
                        title: p.name,
                        kind: "timer",
                        durationMs: p.durationMs,
                      })
                    }
                  >
                    <span className="preset-name">{p.name}</span>
                    <span className="preset-dur">
                      {Math.round(p.durationMs / 60000)}M
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  className="preset-chip arm-more"
                  onClick={() => setAddOpen(true)}
                >
                  <Plus size={12} /> CUSTOM ARM
                </button>
              </div>
            </div>
          </div>

          {/* Active Missions Queue */}
          <section className="terminal-panel queue-panel mt-3">
            <div className="panel-heading">
              <span>TACTICAL OPERATIONS QUEUE ({missionCount})</span>
              <span className="accent">{activeCount} ACTIVE DEPLOYMENTS</span>
            </div>
            <div className="missions-queue-list">
              {missions.length === 0 ? (
                <div className="empty-queue-msg">
                  ALL OPERATIONAL SECTORS QUIET · STANDING BY FOR MISSION DISPATCH
                </div>
              ) : (
                missions.map((m) => {
                  const rem = remainingMs(m, now);
                  const qDigits = clockParts(rem);
                  return (
                    <div
                      key={m.id}
                      className={`queue-item-card ${m.status.toLowerCase()}`}
                    >
                      <div className="queue-item-header">
                        <div className="flex items-center gap-2">
                          {m.kind === "alarm" ? <Bell size={13} /> : <Timer size={13} />}
                          <span className="queue-item-title">{m.title}</span>
                          {m.pinned && <Pin size={11} className="text-[var(--signal)]" />}
                        </div>
                        <span className={`status-pill ${m.status.toLowerCase()}`}>
                          {m.status}
                        </span>
                      </div>
                      <div className="queue-item-body">
                        <div className="queue-digits">{qDigits}</div>
                        <div className="queue-actions">
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
                            onClick={() => control(m.id, "reset")}
                          >
                            <RotateCcw size={12} />
                          </button>
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
          {/* Tactical Surveillance & 24 Countdown Feed */}
          <section className="terminal-panel surveillance-panel">
            <div className="panel-heading flex items-center justify-between">
              <span>
                {showCountdownVideo
                  ? "24 COUNTDOWN MEDIA FEED"
                  : "TACTICAL SURVEILLANCE FEED"}
              </span>
              <button
                type="button"
                onClick={() => setForceCountdownFeed((v) => !v)}
                className="text-[10px] text-[var(--signal)] underline cursor-pointer"
              >
                {forceCountdownFeed ? "[SHOW SAT-FEED]" : "[SHOW 24 FEED]"}
              </button>
            </div>
            <div className="surveillance-frame relative bg-black overflow-hidden h-[220px]">
              {showCountdownVideo ? (
                <video
                  src="/24 Countdown.mp4"
                  autoPlay
                  loop
                  muted={!audio.enabled}
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <img
                  src={surveillance}
                  alt="Watercolor aerial surveillance of downtown Los Angeles"
                  className="surveillance-img w-full h-full object-cover opacity-75"
                />
              )}
              <div className="surveillance-overlay pointer-events-none absolute inset-0">
                <div className="cam-tag">
                  {showCountdownVideo
                    ? "CAM-24 · TITLES FEED"
                    : "SAT-LINK 04 · SECTOR 7"}
                </div>
                <div className="surveillance-reticle" />
                <div className="surveillance-footer">
                  <span>
                    {showCountdownVideo
                      ? "AUDIO: SYNCHRONIZED"
                      : "GRID: 34.0522° N, 118.2437° W"}
                  </span>
                  <span className="accent">
                    {crisis
                      ? "24 AT ZERO · CODE RED"
                      : showCountdownVideo
                        ? "COUNTDOWN ACTIVE"
                        : "SIGNAL: 98.4%"}
                  </span>
                </div>
              </div>
            </div>
            {crisis && (
              <div className="p-2 bg-red-950/80 border-t border-red-500 text-red-200 text-xs font-mono flex items-center justify-between">
                <span>🚨 24 AT ZERO · THEME ACTIVE</span>
                <button
                  type="button"
                  onClick={() => {
                    missions
                      .filter((m) => m.status === "CRISIS")
                      .forEach((m) => control(m.id, "stop"));
                  }}
                  className="px-2 py-0.5 bg-red-700 text-white uppercase text-[10px] font-bold"
                >
                  DISARM ALARM
                </button>
              </div>
            )}
          </section>

          {/* Quick Presets & Audio Controls */}
          <section className="terminal-panel audio-panel mt-3">
            <div className="panel-heading">
              <span>AUDIO MATRIX & CONTROLS</span>
              <button
                type="button"
                className="accent text-[11px] underline"
                onClick={testAlert}
              >
                TEST ZERO THEME
              </button>
            </div>
            <div className="p-3 text-xs font-mono space-y-3">
              <div className="flex items-center justify-between">
                <span>MASTER AUDIO:</span>
                <button
                  type="button"
                  onClick={toggleAudio}
                  className={`px-3 py-1 border text-[11px] ${
                    audio.enabled
                      ? "border-[var(--signal)] text-[var(--signal)]"
                      : "border-neutral-700 text-neutral-500"
                  }`}
                >
                  {audio.enabled ? "ENABLED" : "MUTED"}
                </button>
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span>AT ZERO THEME VOLUME:</span>
                  <span>{Math.round(audio.crisisVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={audio.crisisVolume}
                  onChange={(e) => setAudioVolume(Number(e.target.value))}
                  className="w-full accent-[var(--signal)] cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span>COUNTDOWN AUDIO WINDOW:</span>
                  <span>{audio.countdownWindow} SECONDS</span>
                </div>
                <div className="flex gap-2">
                  {[10, 23, 30, 60].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setAudioWindow(sec)}
                      className={`flex-1 py-1 text-[10px] border ${
                        audio.countdownWindow === sec
                          ? "border-[var(--signal)] bg-[var(--signal)]/20 text-[var(--signal)]"
                          : "border-neutral-800 text-neutral-400"
                      }`}
                    >
                      {sec}S
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-[10px] text-neutral-400 pt-1 border-t border-neutral-900 leading-relaxed">
                • <strong>Countdown:</strong> plays <code>public/24 Countdown.mp4</code>.
                <br />• <strong>At Zero:</strong> plays <code>public/24 At Zero theme.mp3</code>.
              </div>
            </div>
          </section>
        </aside>
      </main>

      {/* Arm Operation Modal Dialog */}
      {addOpen && (
        <div className="arm-modal-backdrop" onClick={() => setAddOpen(false)}>
          <section className="arm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="arm-header">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-[var(--signal)]" />
                <span className="font-bold tracking-wider">ARM TACTICAL OPERATION</span>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setAddOpen(false)}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleArmSubmit} className="arm-form">
              {/* Kind Tabs */}
              <div className="arm-tabs">
                <button
                  type="button"
                  className={`arm-tab ${kind === "timer" ? "active" : ""}`}
                  onClick={() => setKind("timer")}
                >
                  <Timer size={14} /> COUNTDOWN TIMER
                </button>
                <button
                  type="button"
                  className={`arm-tab ${kind === "alarm" ? "active" : ""}`}
                  onClick={() => setKind("alarm")}
                >
                  <Bell size={14} /> DAILY CHECKPOINT ALARM
                </button>
              </div>

              {/* Title Field */}
              <div className="arm-field">
                <label htmlFor="mission-title">OPERATION CODENAME / LABEL</label>
                <input
                  id="mission-title"
                  type="text"
                  placeholder={
                    kind === "timer" ? "Tactical Sprint" : "Daily SITREP Report"
                  }
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="arm-input"
                />
              </div>

              {/* Samsung Style Time Setter */}
              <div className="arm-picker-container">
                <SamsungTimePicker
                  mode={kind}
                  timerValues={timerValues}
                  values={timerValues}
                  onTimerChange={setTimerValues}
                  onChange={setTimerValues}
                  alarmTime={alarmTime}
                  onAlarmChange={setAlarmTime}
                />
              </div>

              {/* Submit Buttons */}
              <div className="arm-actions">
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => setAddOpen(false)}
                >
                  ABORT
                </button>
                <Button type="submit" className="arm-submit-btn">
                  CONFIRM & ARM DEPLOYMENT
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
