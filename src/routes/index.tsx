import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AudioLines,
  Bell,
  ChevronDown,
  ChevronRight,
  Crosshair,
  Expand,
  Eye,
  Globe,
  LockKeyhole,
  Moon,
  Pause,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Shield,
  ShieldCheck,
  Square,
  Timer,
  Trash2,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CTUDigits } from "@/components/ctu-digits";
import { SamsungTimePicker, type SamsungTimerValues } from "@/components/samsung-time-picker";
import { useMissions } from "@/hooks/use-missions";
import { clockParts, protocols, remainingMs } from "@/lib/mission-engine";
import { CTUAudio, defaultAudio, type AudioSettings } from "@/lib/ctu-audio";
import surveillance from "@/assets/la-surveillance.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CTU Terminal — Mission Clock & Operations" },
      {
        name: "description",
        content:
          "A 24-inspired CTU mission terminal with precision countdowns, daily alarms, and tactical audio alerts.",
      },
      { property: "og:title", content: "CTU Terminal — Mission Clock & Operations" },
      {
        property: "og:description",
        content: "Monitor mission time, arm concurrent timers, and command your daily operations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const engine = useMissions();
  const {
    now,
    missions,
    focus,
    pin,
    setPin,
    arm,
    act,
    remove,
    customPresets,
    setCustomPresets,
    loaded,
  } = engine;
  const [format24, setFormat24] = useState(true);
  const [stealth, setStealth] = useState(false);
  const [audio, setAudio] = useState<AudioSettings>(defaultAudio);
  const [audioOpen, setAudioOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [kind, setKind] = useState<"timer" | "alarm">("timer");
  const [title, setTitle] = useState("");
  const [timerValues, setTimerValues] = useState<SamsungTimerValues>({
    hours: 0,
    minutes: 25,
    seconds: 0,
    totalSeconds: 1500,
  });
  const [alarmTime, setAlarmTime] = useState("09:00:00");
  const [savePreset, setSavePreset] = useState(false);
  const [guard, setGuard] = useState(false);
  const [notice, setNotice] = useState("");
  const audioRef = useRef<CTUAudio | null>(null);
  const lockRef = useRef<WakeLockSentinel | null>(null);
  const lastBeat = useRef(-1);

  const crisis = missions.some((m) => m.status === "CRISIS");
  const active = missions.filter((m) =>
    ["ACTIVE", "ARMED", "SNOOZED", "CRISIS"].includes(m.status),
  );
  const remaining = focus ? remainingMs(focus, now) : 0;
  const heightened = active.some((m) => remainingMs(m, now) < 300000);
  const urgent = active.some((m) => remainingMs(m, now) <= audio.window * 1000);
  const tier = crisis ? 3 : urgent ? 2 : 1;

  const date = now ? new Date(now) : null;
  const local = date
    ? date
        .toLocaleTimeString("en-GB", {
          hour12: !format24,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
        .replace(/\s?[ap]m/i, "")
    : "00:00:00";
  const zulu = date ? date.toISOString().slice(11, 19) : "00:00:00";

  useEffect(() => {
    audioRef.current = new CTUAudio();
    try {
      const saved = JSON.parse(localStorage.getItem("ctu-settings-v1") ?? "null");
      if (saved) {
        setAudio({ ...defaultAudio, ...saved.audio, enabled: false });
        setFormat24(saved.format24 ?? true);
        setStealth(saved.stealth ?? false);
      }
    } catch {}
    return () => audioRef.current?.close();
  }, []);

  useEffect(() => {
    if (loaded)
      try {
        localStorage.setItem("ctu-settings-v1", JSON.stringify({ audio, format24, stealth }));
      } catch {}
  }, [audio, format24, stealth, loaded]);

  useEffect(() => {
    const beat = Math.floor(now / 1000);
    if (beat === lastBeat.current || !now) return;
    lastBeat.current = beat;
    if (active.length) audioRef.current?.tick(tier, audio, beat);
  }, [now, tier, audio, active.length]);

  useEffect(() => {
    document.title = focus
      ? `[${clockParts(remaining)}] ${crisis ? "CRISIS · " : ""}CTU Terminal`
      : "CTU Terminal — Mission Clock & Operations";
  }, [focus, remaining, crisis]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const toggleGuard = async () => {
    if (!("wakeLock" in navigator)) {
      setNotice("Terminal Guard wake lock is not supported on this device");
      return;
    }
    if (guard) {
      await lockRef.current?.release();
      lockRef.current = null;
      setGuard(false);
      setNotice("Terminal Guard deactivated");
    } else {
      try {
        lockRef.current = await navigator.wakeLock.request("screen");
        setGuard(true);
        setNotice("Terminal Guard active: display stay-awake locked");
      } catch {
        setNotice("Could not engage screen wake lock");
      }
    }
  };

  const handleArmSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (kind === "timer") {
      const totalSec = timerValues.totalSeconds;
      if (totalSec <= 0) {
        setNotice("Invalid duration: please select at least 1 second");
        return;
      }
      const finalTitle = title.trim() || `TACTICAL OP ${clockParts(totalSec * 1000)}`;
      arm({
        kind: "timer",
        title: finalTitle,
        seconds: totalSec,
      });
      if (savePreset) {
        setCustomPresets((prev) => [
          ...prev,
          { title: finalTitle, minutes: Math.max(1, Math.round(totalSec / 60)) },
        ]);
      }
    } else {
      arm({
        kind: "alarm",
        title: title.trim() || `DAILY ALARM ${alarmTime}`,
        time: alarmTime,
      });
    }
    audioRef.current?.chirp(audio);
    setAddOpen(false);
    setTitle("");
    setSavePreset(false);
  };

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <main className={`ctu-screen ${stealth ? "stealth-mode" : ""} ${crisis ? "threat-crisis" : heightened ? "threat-heightened" : "threat-watch"}`}>
      {/* Top Threat Strobe Perimeters */}
      <div className="perimeter-strobe top-strobe" />
      <div className="perimeter-strobe bottom-strobe" />

      {/* Header telemetry & branding */}
      <header className="ctu-header">
        <div className="brand">
          <div className="ctu-mark">CTU</div>
          <div className="brand-text">
            <span className="brand-org">COUNTER TERRORIST UNIT</span>
            <span className="brand-div">LOS ANGELES STATION · SECTOR 4</span>
          </div>
        </div>

        <div className="header-telemetry">
          <div className="telemetry-block zulu-block">
            <span className="telemetry-tag">
              <Globe className="h-3 w-3 inline mr-1" />
              ZULU TIME (UTC)
            </span>
            <span className="telemetry-value zulu-clock">{zulu}</span>
          </div>

          <div className="header-status-pill">
            <div className="status-blip" />
            <span>{crisis ? "CODE RED · CRISIS" : heightened ? "THREAT CON 2" : "THREAT CON 4"}</span>
          </div>
        </div>
      </header>

      {/* Main Tactical Grid Viewport */}
      <div className="tactical-layout">
        {/* Left Column: Unified Stage + Presets */}
        <section className="command-stage-column">
          {/* UNIFIED DUAL COMMAND STAGE */}
          <div className={`unified-command-stage ${crisis ? "stage-crisis" : ""}`}>
            {/* Top Bar / Header of Stage */}
            <div className="stage-top-bar">
              <div className="stage-branding">
                <span className="stage-title-tag">PRIMARY OPERATIONS & REAL-TIME TELEMETRY</span>
                <span className="stage-sub-tag">LOS ANGELES TIME ZONE · SYNCHRONIZED</span>
              </div>
              <div className="stage-controls">
                <button
                  type="button"
                  className={`stage-btn-pill ${format24 ? "active" : ""}`}
                  onClick={() => setFormat24((v) => !v)}
                  title="Toggle 12h / 24h format"
                >
                  {format24 ? "24H FORMAT" : "12H FORMAT"}
                </button>
                <button
                  type="button"
                  className="stage-btn-pill"
                  onClick={handleFullscreen}
                  title="Fullscreen Terminal View"
                >
                  <Expand className="h-3 w-3 inline mr-1" />
                  FULLSCREEN
                </button>
              </div>
            </div>

            {/* Split Sectors: Local Mission Time & Focus Operation */}
            <div className="stage-dual-grid">
              {/* Sector 1: Local Mission Time */}
              <div className="stage-sector sector-local-time">
                <div className="sector-telemetry-header">
                  <span className="sector-label">LOCAL MISSION TIME</span>
                  <span className="sector-indicator live-pulse">
                    <Radio className="h-3 w-3 inline mr-1" />
                    LIVE PACIFIC
                  </span>
                </div>

                <div className="sector-clock-display">
                  <CTUDigits value={local} size="hero" className="local-mission-digits" />
                </div>

                <div className="sector-footer-telemetry">
                  <span className="real-time-banner">EVENTS OCCUR IN REAL TIME</span>
                </div>
              </div>

              {/* Sector Divider */}
              <div className="stage-divider" />

              {/* Sector 2: Active Primary Operation */}
              <div className="stage-sector sector-focus-op">
                <div className="sector-telemetry-header">
                  <div className="flex items-center gap-2">
                    <span className="sector-label">PRIMARY OPERATION</span>
                    {focus?.kind === "alarm" && (
                      <span className="tactical-badge alarm-badge">DAILY ALARM</span>
                    )}
                    {pin === focus?.id && (
                      <span className="tactical-badge pinned-badge">LOCKED ON STAGE</span>
                    )}
                  </div>
                  <span className="sector-indicator">
                    STATUS: {focus ? focus.status : "STANDBY"}
                  </span>
                </div>

                <div className="sector-clock-display">
                  {focus ? (
                    <CTUDigits
                      value={clockParts(remaining)}
                      size="hero"
                      className={`focus-countdown-digits ${focus.status === "PAUSED" ? "digits-paused" : ""}`}
                    />
                  ) : (
                    <div className="standby-display">
                      <span className="standby-digits">00:00:00</span>
                      <span className="standby-hint">NO MISSION PINNED · READY TO ARM</span>
                    </div>
                  )}
                </div>

                <div className="sector-footer-op-info">
                  <div className="op-title-text">
                    {focus ? focus.title : "TACTICAL STANDBY — PROTOCOLS READY"}
                  </div>
                  {focus && (
                    <div className="focus-action-row">
                      {focus.status === "ACTIVE" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="tactical-btn"
                          onClick={() => act(focus.id, "pause")}
                        >
                          <Pause className="h-4 w-4 mr-1" /> PAUSE
                        </Button>
                      ) : focus.status === "PAUSED" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="tactical-btn"
                          onClick={() => act(focus.id, "start")}
                        >
                          <Play className="h-4 w-4 mr-1" /> RESUME
                        </Button>
                      ) : null}

                      {focus.status === "CRISIS" && (
                        <Button
                          size="sm"
                          className="tactical-btn crisis-btn"
                          onClick={() => act(focus.id, "snooze", audio.snoozeMinutes * 60)}
                        >
                          <Bell className="h-4 w-4 mr-1" /> SNOOZE ({audio.snoozeMinutes}M)
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="outline"
                        className="tactical-btn"
                        onClick={() => act(focus.id, "reset")}
                      >
                        <RotateCcw className="h-4 w-4 mr-1" /> RESET
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        className="tactical-btn btn-danger"
                        onClick={() => act(focus.id, "stop")}
                      >
                        <Square className="h-4 w-4 mr-1" /> DISARM
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* QUICK-ARM PROTOCOLS & ACTION BUTTON */}
          <div className="tactical-panel presets-panel">
            <div className="panel-header">
              <span className="panel-title">
                <Zap className="h-4 w-4 inline mr-1 text-primary" />
                TACTICAL QUICK-ARM PROTOCOLS
              </span>
              <Button
                size="sm"
                className="arm-op-trigger-btn"
                onClick={() => setAddOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                ARM AN OPERATION
              </Button>
            </div>

            <div className="presets-grid">
              {protocols.map((p) => (
                <button
                  key={p.title}
                  type="button"
                  className="preset-chip"
                  onClick={() => {
                    arm({ kind: "timer", title: p.title, seconds: p.minutes * 60 });
                    audioRef.current?.chirp(audio);
                  }}
                >
                  <span className="preset-name">{p.title}</span>
                  <span className="preset-duration">{p.minutes}M</span>
                </button>
              ))}

              {customPresets.map((cp) => (
                <button
                  key={cp.title}
                  type="button"
                  className="preset-chip preset-custom"
                  onClick={() => {
                    arm({ kind: "timer", title: cp.title, seconds: cp.minutes * 60 });
                    audioRef.current?.chirp(audio);
                  }}
                >
                  <span className="preset-name">{cp.title}</span>
                  <span className="preset-duration">{cp.minutes}M</span>
                </button>
              ))}
            </div>
          </div>

          {/* ACTIVE OPERATIONS QUEUE */}
          <div className="tactical-panel queue-panel">
            <div className="panel-header">
              <span className="panel-title">
                <Activity className="h-4 w-4 inline mr-1 text-primary" />
                ACTIVE OPERATIONS QUEUE ({missions.length})
              </span>
            </div>

            <div className="queue-list">
              {missions.length === 0 ? (
                <div className="queue-empty">ALL SECTORS SECURE · NO ACTIVE TIMERS</div>
              ) : (
                missions.map((m) => {
                  const rem = remainingMs(m, now);
                  const isFocus = focus?.id === m.id;
                  const isPinned = pin === m.id;
                  return (
                    <div
                      key={m.id}
                      className={`queue-item ${isFocus ? "queue-item-focused" : ""} ${m.status === "CRISIS" ? "queue-item-crisis" : ""}`}
                    >
                      <button
                        type="button"
                        className="pin-toggle-btn"
                        onClick={() => setPin(isPinned ? null : m.id)}
                        title={isPinned ? "Unlock from main stage" : "Lock to main stage"}
                      >
                        <Crosshair className={`h-4 w-4 ${isPinned ? "text-primary fill-primary" : "text-muted"}`} />
                      </button>

                      <div className="queue-item-info">
                        <span className="queue-item-title">{m.title}</span>
                        <span className="queue-item-meta">
                          {m.kind.toUpperCase()} · STATUS: {m.status}
                        </span>
                      </div>

                      <div className="queue-item-clock">
                        <CTUDigits value={clockParts(rem)} size="sm" />
                      </div>

                      <div className="queue-item-actions">
                        {m.status === "ACTIVE" ? (
                          <button
                            type="button"
                            className="queue-btn"
                            onClick={() => act(m.id, "pause")}
                            title="Pause"
                          >
                            <Pause className="h-3.5 w-3.5" />
                          </button>
                        ) : m.status === "PAUSED" ? (
                          <button
                            type="button"
                            className="queue-btn"
                            onClick={() => act(m.id, "start")}
                            title="Resume"
                          >
                            <Play className="h-3.5 w-3.5" />
                          </button>
                        ) : null}

                        <button
                          type="button"
                          className="queue-btn"
                          onClick={() => act(m.id, "reset")}
                          title="Reset"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>

                        <button
                          type="button"
                          className="queue-btn queue-btn-del"
                          onClick={() => remove(m.id)}
                          title="Purge"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        {/* Right Column: Surveillance & Tactical Controls */}
        <aside className="surveillance-column">
          {/* Surveillance Feed Panel */}
          <div className="tactical-panel surveillance-panel">
            <div className="panel-header">
              <span className="panel-title">
                <Eye className="h-4 w-4 inline mr-1 text-primary" />
                SURVEILLANCE QUADRANT 1
              </span>
              <span className="live-badge">LIVE SATELLITE</span>
            </div>
            <div className="surveillance-frame">
              <img
                src={surveillance}
                alt="CTU Tactical Surveillance"
                className="surveillance-img"
              />
              <div className="surveillance-crosshair" />
              <div className="surveillance-grid-overlay" />
              <div className="surveillance-telemetry-stamp">
                <span>SAT-ID: KEYHOLE-11</span>
                <span>GRID: 34.0522° N, 118.2437° W</span>
              </div>
            </div>
          </div>

          {/* Quick Terminal Telemetry & Utility Bar */}
          <div className="tactical-panel utility-panel">
            <div className="panel-header">
              <span className="panel-title">
                <ShieldCheck className="h-4 w-4 inline mr-1 text-primary" />
                TERMINAL TELEMETRY
              </span>
            </div>

            <div className="utility-buttons-stack">
              <button
                type="button"
                className={`util-toggle-row ${guard ? "util-active" : ""}`}
                onClick={toggleGuard}
              >
                <div className="flex items-center gap-2">
                  <LockKeyhole className="h-4 w-4" />
                  <span>TERMINAL GUARD (WAKE LOCK)</span>
                </div>
                <span className="util-status">{guard ? "LOCKED ON" : "STANDBY"}</span>
              </button>

              <button
                type="button"
                className={`util-toggle-row ${stealth ? "util-active" : ""}`}
                onClick={() => setStealth((s) => !s)}
              >
                <div className="flex items-center gap-2">
                  <Moon className="h-4 w-4" />
                  <span>NIGHT OPS / STEALTH PHOSPHOR</span>
                </div>
                <span className="util-status">{stealth ? "ACTIVE" : "OFF"}</span>
              </button>

              <button
                type="button"
                className={`util-toggle-row ${audioOpen ? "util-active" : ""}`}
                onClick={() => setAudioOpen((o) => !o)}
              >
                <div className="flex items-center gap-2">
                  <AudioLines className="h-4 w-4" />
                  <span>AUDIO MATRIX BUS</span>
                </div>
                <ChevronDown className={`h-4 w-4 transition-transform ${audioOpen ? "rotate-180" : ""}`} />
              </button>
            </div>

            {/* Expandable Audio Matrix */}
            {audioOpen && (
              <div className="audio-matrix-drawer">
                <div className="audio-row">
                  <span className="audio-label">AUDIO MASTER</span>
                  <button
                    type="button"
                    className={`audio-toggle-btn ${audio.enabled ? "active" : ""}`}
                    onClick={() => {
                      const next = !audio.enabled;
                      setAudio((a) => ({ ...a, enabled: next }));
                      if (next) audioRef.current?.chirp({ ...audio, enabled: true });
                    }}
                  >
                    {audio.enabled ? (
                      <>
                        <Volume2 className="h-4 w-4 mr-1 inline" /> ENGAGED
                      </>
                    ) : (
                      <>
                        <VolumeX className="h-4 w-4 mr-1 inline" /> MUTED
                      </>
                    )}
                  </button>
                </div>

                <div className="audio-slider-block">
                  <div className="slider-header">
                    <span>AMBIENT BULLPEN TICK</span>
                    <span>{Math.round(audio.ambientVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={audio.ambientVolume}
                    onChange={(e) =>
                      setAudio((a) => ({ ...a, ambientVolume: parseFloat(e.target.value) }))
                    }
                    className="tactical-slider"
                  />
                </div>

                <div className="audio-slider-block">
                  <div className="slider-header">
                    <span>COUNTDOWN TENSION TICK</span>
                    <span>{Math.round(audio.countdownVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={audio.countdownVolume}
                    onChange={(e) =>
                      setAudio((a) => ({ ...a, countdownVolume: parseFloat(e.target.value) }))
                    }
                    className="tactical-slider"
                  />
                </div>

                <div className="audio-slider-block">
                  <div className="slider-header">
                    <span>CRISIS THEME ALERT</span>
                    <span>{Math.round(audio.alarmVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={audio.alarmVolume}
                    onChange={(e) =>
                      setAudio((a) => ({ ...a, alarmVolume: parseFloat(e.target.value) }))
                    }
                    className="tactical-slider"
                  />
                </div>

                <div className="audio-setting-row">
                  <span className="setting-label">URGENT TENSION WINDOW</span>
                  <div className="flex gap-1">
                    {[10, 30, 60].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        className={`mini-pill ${audio.window === sec ? "active" : ""}`}
                        onClick={() => setAudio((a) => ({ ...a, window: sec }))}
                      >
                        {sec}S
                      </button>
                    ))}
                  </div>
                </div>

                <div className="audio-setting-row">
                  <span className="setting-label">DEFAULT SNOOZE</span>
                  <div className="flex gap-1">
                    {[5, 9, 10].map((min) => (
                      <button
                        key={min}
                        type="button"
                        className={`mini-pill ${audio.snoozeMinutes === min ? "active" : ""}`}
                        onClick={() => setAudio((a) => ({ ...a, snoozeMinutes: min }))}
                      >
                        {min}M
                      </button>
                    ))}
                  </div>
                </div>

                <div className="audio-checkbox-row">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={audio.phoneAlert}
                      onChange={(e) =>
                        setAudio((a) => ({ ...a, phoneAlert: e.target.checked }))
                      }
                      className="tactical-checkbox"
                    />
                    <span className="text-xs">SYNTHESIZED CTU PHONE RINGTONE ON ALERT</span>
                  </label>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  className="w-full mt-2 tactical-btn"
                  onClick={() => {
                    audioRef.current?.chirp({ ...audio, enabled: true });
                    setNotice("Audio Matrix test chirp transmitted");
                  }}
                >
                  TEST CHIRP TRANSMISSION
                </Button>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Notice Banner */}
      {notice && <div className="tactical-notice-banner">{notice}</div>}

      {/* ARM AN OPERATION MODAL with SAMSUNG TIME PICKER */}
      {addOpen && (
        <div className="arm-modal-backdrop" onClick={() => setAddOpen(false)}>
          <section
            className="arm-modal-panel"
            onClick={(e) => e.stopPropagation()}
            aria-labelledby="arm-modal-title"
          >
            <div className="arm-modal-header">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <h2 id="arm-modal-title" className="arm-modal-title">
                  ARM AN OPERATION
                </h2>
              </div>
              <button
                type="button"
                className="close-btn"
                onClick={() => setAddOpen(false)}
                aria-label="Close Arm Modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="arm-type-selector">
              <button
                type="button"
                className={`type-tab ${kind === "timer" ? "active" : ""}`}
                onClick={() => setKind("timer")}
              >
                <Timer className="h-4 w-4 mr-1 inline" />
                COUNTDOWN TIMER
              </button>
              <button
                type="button"
                className={`type-tab ${kind === "alarm" ? "active" : ""}`}
                onClick={() => setKind("alarm")}
              >
                <Bell className="h-4 w-4 mr-1 inline" />
                DAILY FIXED ALARM
              </button>
            </div>

            <form onSubmit={handleArmSubmit} className="arm-form">
              <div className="form-group">
                <label htmlFor="mission-title" className="form-label">
                  OPERATION TITLE / PROTOCOL IDENTIFIER:
                </label>
                <input
                  id="mission-title"
                  type="text"
                  placeholder={
                    kind === "timer"
                      ? "e.g. PERIMETER RECON / SATELLITE PASS"
                      : "e.g. MORNING BRIEFING / BRIEF SECDEF"
                  }
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="tactical-input"
                  autoFocus
                />
              </div>

              {/* SAMSUNG STYLE DRUM TIME SETTER */}
              <div className="form-group">
                <label className="form-label">
                  {kind === "timer" ? "SET COUNTDOWN DURATION:" : "SET ALARM TARGET TIME:"}
                </label>

                {kind === "timer" ? (
                  <SamsungTimePicker
                    mode="countdown"
                    timerValues={timerValues}
                    onTimerChange={setTimerValues}
                  />
                ) : (
                  <SamsungTimePicker
                    mode="alarm"
                    alarmTime={alarmTime}
                    onAlarmChange={setAlarmTime}
                  />
                )}
              </div>

              {kind === "timer" && (
                <div className="form-checkbox-row">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={savePreset}
                      onChange={(e) => setSavePreset(e.target.checked)}
                      className="tactical-checkbox"
                    />
                    <span className="text-xs">SAVE AS REUSABLE QUICK-ARM PROTOCOL</span>
                  </label>
                </div>
              )}

              <div className="arm-submit-row">
                <Button type="button" variant="outline" className="tactical-btn" onClick={() => setAddOpen(false)}>
                  CANCEL
                </Button>
                <Button type="submit" className="arm-submit-btn">
                  <Plus className="h-4 w-4 mr-1" />
                  ARM OPERATION
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
