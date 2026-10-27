// src/routes/index.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clockParts,
  focusMission,
  nextAlarm,
  remainingMs,
  type Mission,
  type Preset,
} from "@/lib/mission-engine";
import { useMissions } from "@/hooks/use-missions";
import { CTUDigits } from "@/components/ctu-digits";
import { SamsungTimePicker } from "@/components/samsung-time-picker";
import {
  Volume2,
  VolumeX,
  Play,
  Square,
  RotateCcw,
  Plus,
  Radio,
  Clock,
  Pin,
  Trash2,
  Tv,
  Film,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: CTUTerminal,
  head: () => ({
    title: "CTU Operational Timer - 24 Real-Time Command Deck",
    meta: [
      {
        name: "description",
        content:
          "Los Angeles Counter Terrorist Unit mission clock, tactical timers, countdown HUD and crisis alert system.",
      },
      { property: "og:title", content: "CTU Operational Timer - 24 Command Deck" },
      { property: "og:description", content: "Tactical 24-style mission operations terminal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

interface SectorOption {
  code: string;
  label: string;
  timeZone: string;
}

const TIMEZONE_SECTORS: SectorOption[] = [
  { code: "BKK", label: "Bangkok (ICT +07:00)", timeZone: "Asia/Bangkok" },
  { code: "LAX", label: "CTU LA HQ (PST -08:00)", timeZone: "America/Los_Angeles" },
  { code: "WDC", label: "DC / POTUS (EST -05:00)", timeZone: "America/New_York" },
  { code: "LON", label: "MI6 London (GMT +00:00)", timeZone: "Europe/London" },
  { code: "TYO", label: "Tokyo Section (JST +09:00)", timeZone: "Asia/Tokyo" },
  { code: "LOC", label: "Local Device Station", timeZone: "local" },
];

function getTzOffsetMs(timeZone: string, at: number): number {
  if (timeZone === "local") return 0;
  try {
    const d = new Date(at);
    const utcDate = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
    const tzDate = new Date(d.toLocaleString("en-US", { timeZone }));
    return tzDate.getTime() - utcDate.getTime();
  } catch {
    return 0;
  }
}

export function CTUTerminal() {
  const {
    now,
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
    ensureAudio,
  } = useMissions();

  // Settings & state with safe defaults
  const [format24, setFormat24] = useState(true);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [stealth, setStealth] = useState(false);
  const [sectorTz, setSectorTz] = useState("Asia/Bangkok");

  // Video feed director: AUTO | OPENING | COUNTDOWN | CLOSING | SAT
  const [feedChannel, setFeedChannel] = useState<"AUTO" | "OPENING" | "COUNTDOWN" | "CLOSING" | "SAT">("AUTO");

  // Arm modal state
  const [armModalOpen, setArmModalOpen] = useState(false);
  const [armKind, setArmKind] = useState<"timer" | "alarm">("timer");
  const [armTitle, setArmTitle] = useState("");
  const [timerValues, setTimerValues] = useState({
    hours: 0,
    minutes: 25,
    seconds: 0,
    totalSeconds: 1500,
  });
  const [alarmTime, setAlarmTime] = useState("06:00:00");

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Hydrate settings on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ctu-settings-v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.format24 === "boolean") setFormat24(parsed.format24);
        if (typeof parsed.stealth === "boolean") setStealth(parsed.stealth);
        if (typeof parsed.sectorTz === "string") setSectorTz(parsed.sectorTz);
      }
    } catch {
      // Ignore
    }
  }, []);

  // Save settings on update
  useEffect(() => {
    try {
      localStorage.setItem(
        "ctu-settings-v1",
        JSON.stringify({ format24, stealth, sectorTz }),
      );
    } catch {
      // Ignore
    }
  }, [format24, stealth, sectorTz]);

  // Keep screen awake (Wake Lock)
  useEffect(() => {
    let lock: any = null;
    const requestLock = async () => {
      try {
        if ("wakeLock" in navigator && document.visibilityState === "visible") {
          lock = await (navigator as any).wakeLock.request("screen");
        }
      } catch {
        // Not supported or rejected
      }
    };
    void requestLock();
    const handleVis = () => {
      if (document.visibilityState === "visible") void requestLock();
    };
    document.addEventListener("visibilitychange", handleVis);
    return () => {
      document.removeEventListener("visibilitychange", handleVis);
      if (lock) lock.release().catch(() => {});
    };
  }, []);

  // Active operational focus
  const activeFocus = useMemo(() => {
    return focusMission(missions, pinnedId, now);
  }, [missions, pinnedId, now]);

  const focusLeftMs = useMemo(() => {
    return activeFocus ? remainingMs(activeFocus, now) : 0;
  }, [activeFocus, now]);

  const focusTotalSeconds = Math.ceil(focusLeftMs / 1000);
  const isRunning = activeFocus?.status === "ACTIVE";
  const isCrisis = activeFocus?.status === "CRISIS" || missions.some((m) => m.status === "CRISIS");

  // 10-Second Focused Takeover Condition (Matches User Recording)
  const isCountdownTakeover =
    isRunning && focusTotalSeconds <= 10 && focusTotalSeconds > 0;
  const isCrisisTakeover = isRunning && focusTotalSeconds <= 3 && focusTotalSeconds > 0;

  // Local Theater Clock
  const localClock = useMemo(() => {
    const at = now || Date.now();
    try {
      const opts: Intl.DateTimeFormatOptions = {
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        hour12: !format24,
      };
      if (sectorTz !== "local") opts.timeZone = sectorTz;
      const formatter = new Intl.DateTimeFormat("en-US", opts);
      const str = formatter.format(new Date(at));
      const match = str.match(/(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?/i);
      if (match) {
        const hh = match[1].padStart(2, "0");
        const mm = match[2];
        const ss = match[3];
        return {
          digits: `${hh}:${mm}:${ss}`,
          period: match[4] ? match[4].toUpperCase() : "",
        };
      }
    } catch {
      // Fallback
    }
    const d = new Date(at);
    let h = d.getHours();
    const p = h >= 12 ? "PM" : "AM";
    if (!format24) h = h % 12 || 12;
    return {
      digits: `${String(h).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`,
      period: format24 ? "" : p,
    };
  }, [now, format24, sectorTz]);

  const focusDigits = clockParts(focusLeftMs);

  // Active video source resolution
  const activeVideoSource = useMemo(() => {
    if (feedChannel === "OPENING") return "/24 Opening.mp4";
    if (feedChannel === "COUNTDOWN") return "/24 Countdown.mp4";
    if (feedChannel === "CLOSING") return "/24 Closing.mp4";
    if (feedChannel === "SAT") return null;

    // AUTO logic
    if (isCrisis) return "/24 Closing.mp4";
    if (isCountdownTakeover && focusTotalSeconds <= 5) return "/24 Countdown.mp4";
    return null;
  }, [feedChannel, isCrisis, isCountdownTakeover, focusTotalSeconds]);

  // Handle video autoplay synchronization
  useEffect(() => {
    if (videoRef.current && activeVideoSource) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  }, [activeVideoSource]);

  // Arm submission
  const handleArmSubmit = useCallback(() => {
    void ensureAudio();
    if (armKind === "timer") {
      const durMs =
        (timerValues.totalSeconds && timerValues.totalSeconds > 0
          ? timerValues.totalSeconds
          : timerValues.hours * 3600 + timerValues.minutes * 60 + timerValues.seconds) * 1000;
      if (durMs <= 0) return;
      arm({
        kind: "timer",
        title: armTitle.trim() || `Tactical ${Math.round(durMs / 60000)}M`,
        durationMs: durMs,
      });
    } else {
      const targetUtc = nextAlarm(alarmTime, now);
      const offsetMs = getTzOffsetMs(sectorTz, now);
      const adjustedTarget = targetUtc - offsetMs;
      const durMs = Math.max(1000, adjustedTarget - now);
      arm({
        kind: "alarm",
        title: armTitle.trim() || `Alarm ${alarmTime}`,
        durationMs: durMs,
        alarmTime,
      });
    }
    setArmModalOpen(false);
    setArmTitle("");
  }, [armKind, timerValues, armTitle, alarmTime, now, sectorTz, arm, ensureAudio]);

  return (
    <div
      className={`ctu-app-container ${stealth ? "stealth-mode" : ""} ${
        isCrisis ? "threat-crisis" : ""
      }`}
    >
      {/* =========================================================================
          10-SECOND TACTICAL TAKEOVER (EXACT SEQUENCE FROM USER'S S23 RECORDING)
          ========================================================================= */}
      {isCountdownTakeover && (
        <div
          className={`countdown-takeover-overlay ${
            isCrisisTakeover ? "crisis-red-glow" : "amber-glow"
          }`}
          onClick={() => {
            if (activeFocus) control(activeFocus.id, "RESET");
          }}
          role="button"
          tabIndex={0}
          aria-label="Tactical countdown in progress. Tap to cancel."
        >
          {/* Subtle tactical scanlines & CRT vignette */}
          <div className="takeover-crt-overlay" />

          <div className="takeover-content">
            {/* GIANT COUNTDOWN DIGIT */}
            <div
              className={`takeover-digit ${
                isCrisisTakeover ? "takeover-digit-red" : "takeover-digit-amber"
              }`}
            >
              {focusTotalSeconds}
            </div>

            {/* HEADER / CONTEXT */}
            <div className="takeover-title">
              {activeFocus?.kind === "alarm" ? "ALARM IMMINENT" : "TIMER / ALARM"}
            </div>

            {/* TAP TO CANCEL PROMPT */}
            <div className="takeover-cancel-sub">TAP TO CANCEL</div>

            {/* HORIZONTAL DEPLETING PROGRESS BAR */}
            <div className="takeover-bar-track">
              <div
                className={`takeover-bar-fill ${
                  isCrisisTakeover ? "bar-fill-red" : "bar-fill-amber"
                }`}
                style={{
                  width: `${Math.min(100, (focusTotalSeconds / 10) * 100)}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* TOP COMMAND HEADER */}
      <header className="ctu-command-header">
        <div className="brand-lockup">
          <span className="brand-badge">24</span>
          <div className="brand-text">
            <h1 className="brand-title">CTU // LOS ANGELES</h1>
            <p className="brand-subtitle">OPERATIONAL DEFENSE COMMAND TERMINAL</p>
          </div>
        </div>

        {/* TOP QUICK DIRECTORS: OPENING & ENDING CREDITS */}
        <div className="quick-media-directors">
          <button
            type="button"
            className={`quick-dir-btn ${feedChannel === "OPENING" ? "active-gold" : ""}`}
            onClick={() => {
              void ensureAudio();
              setFeedChannel((curr) => (curr === "OPENING" ? "AUTO" : "OPENING"));
            }}
          >
            <Play size={13} />
            <span>START 24 OPENING</span>
          </button>
          <button
            type="button"
            className={`quick-dir-btn ${feedChannel === "CLOSING" ? "active-gold" : ""}`}
            onClick={() => {
              void ensureAudio();
              setFeedChannel((curr) => (curr === "CLOSING" ? "AUTO" : "CLOSING"));
            }}
          >
            <Film size={13} />
            <span>ENDING CREDITS</span>
          </button>
        </div>

        {/* SYSTEM STATUS PILLS */}
        <div className="header-status-pills">
          <button
            type="button"
            className={`tactical-pill ${audio.enabled ? "pill-active" : "pill-muted"}`}
            onClick={() => {
              void ensureAudio();
              toggleAudio();
            }}
          >
            {audio.enabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
            <span>AUDIO {audio.enabled ? "ACTIVE" : "MUTED"}</span>
          </button>
          <button
            type="button"
            className={`tactical-pill ${stealth ? "pill-active" : ""}`}
            onClick={() => setStealth(!stealth)}
          >
            <span>{stealth ? "NIGHT OPS" : "AMBER SEC"}</span>
          </button>
        </div>
      </header>

      {/* CRISIS BANNER WHEN AT ZERO */}
      {isCrisis && (
        <div className="crisis-takeover-banner">
          <div className="crisis-text">
            <span className="crisis-pulse-dot" />
            <span>CODE RED // ZERO REACHED // MISSION COMPROMISED</span>
          </div>
          <div className="crisis-actions">
            <button
              type="button"
              className="crisis-disarm-btn"
              onClick={() => {
                missions.forEach((m) => {
                  if (m.status === "CRISIS") control(m.id, "STOP");
                });
              }}
            >
              DISARM ALARM
            </button>
            {activeFocus && (
              <button
                type="button"
                className="crisis-snooze-btn"
                onClick={() => snooze(activeFocus.id)}
              >
                SNOOZE (+5M)
              </button>
            )}
          </div>
        </div>
      )}

      {/* UNIFIED COMMAND DECK: MISSION CLOCK + ACTIVE OPERATION */}
      <section className="unified-stage-card">
        <div className="unified-stage-grid">
          {/* SECTOR 1: LOCAL MISSION CLOCK */}
          <div className="stage-sector sector-local">
            <div className="sector-header">
              <div className="sector-tag">
                <Clock size={14} className="tag-icon" />
                <span className="tag-label">LOCAL MISSION TIME</span>
              </div>
              <div className="sector-controls">
                <select
                  aria-label="Operational Theater Selection"
                  value={sectorTz}
                  onChange={(e) => setSectorTz(e.target.value)}
                  className="tz-select-input"
                >
                  {TIMEZONE_SECTORS.map((s) => (
                    <option key={s.code} value={s.timeZone}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="format-toggle-btn"
                  onClick={() => setFormat24(!format24)}
                >
                  {format24 ? "24H" : "12H"}
                </button>
              </div>
            </div>

            <div className="sector-display">
              <CTUDigits time={localClock.digits} blink className="clock-digits" />
              {localClock.period && (
                <div className="period-badge">{localClock.period}</div>
              )}
            </div>

            <div className="digit-labels">
              <span>HOURS</span>
              <span>MINUTES</span>
              <span>SECONDS</span>
            </div>
          </div>

          {/* SECTOR 2: ACTIVE TARGET COUNTDOWN */}
          <div
            className={`stage-sector sector-target ${
              isCrisis ? "sector-threat-crisis" : ""
            }`}
          >
            <div className="sector-header">
              <div className="sector-tag">
                <Radio size={14} className="tag-icon" />
                <span className="tag-label">
                  {activeFocus ? activeFocus.title.toUpperCase() : "TARGET WINDOW"}
                </span>
              </div>
              <div className="sector-controls">
                <span className={`status-chip chip-${activeFocus?.status ?? "IDLE"}`}>
                  {activeFocus?.status ?? "STANDBY"}
                </span>
                {activeFocus && (
                  <button
                    type="button"
                    className={`pin-btn ${activeFocus.pinned ? "pinned" : ""}`}
                    onClick={() => togglePin(activeFocus.id)}
                    title="Pin target to primary focus"
                  >
                    <Pin size={12} />
                  </button>
                )}
              </div>
            </div>

            <div className="sector-display">
              <CTUDigits time={focusDigits} blink={isRunning} className="focus-digits" />
            </div>

            <div className="digit-labels">
              <span>HOURS</span>
              <span>MINUTES</span>
              <span>SECONDS</span>
            </div>

            {/* PRIMARY TIMING CONTROLS */}
            <div className="sector-actions">
              {activeFocus ? (
                <>
                  {activeFocus.status === "ACTIVE" ? (
                    <button
                      type="button"
                      className="tactical-btn btn-pause"
                      onClick={() => control(activeFocus.id, "PAUSE")}
                    >
                      <Square size={13} />
                      <span>PAUSE</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="tactical-btn btn-start"
                      onClick={() => control(activeFocus.id, "START")}
                    >
                      <Play size={13} />
                      <span>START</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="tactical-btn btn-reset"
                    onClick={() => control(activeFocus.id, "RESET")}
                  >
                    <RotateCcw size={13} />
                    <span>RESET</span>
                  </button>
                  <button
                    type="button"
                    className="tactical-btn btn-cancel"
                    onClick={() => remove(activeFocus.id)}
                  >
                    <Trash2 size={13} />
                    <span>ABORT</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="tactical-btn btn-arm-prompt"
                  onClick={() => {
                    void ensureAudio();
                    setArmModalOpen(true);
                  }}
                >
                  <Plus size={14} />
                  <span>ARM NEW OPERATION</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* TACTICAL PRESET CHIPS */}
        <div className="deck-presets-bar">
          <span className="presets-label">TACTICAL QUICK-ARM:</span>
          <div className="preset-buttons">
            {presets.slice(0, 4).map((p: Preset) => (
              <button
                key={p.id}
                type="button"
                className="preset-chip-btn"
                onClick={() => {
                  void ensureAudio();
                  arm({
                    title: p.title || p.name || "Operation",
                    kind: p.kind ?? "timer",
                    durationMs: p.durationMs,
                  });
                }}
              >
                <span>{p.title || p.name}</span>
                <span className="preset-dur">
                  ({Math.round(p.durationMs / 60000)}M)
                </span>
              </button>
            ))}
            <button
              type="button"
              className="preset-chip-btn chip-custom"
              onClick={() => {
                void ensureAudio();
                setArmModalOpen(true);
              }}
            >
              <Plus size={12} />
              <span>CUSTOM ARM...</span>
            </button>
          </div>
        </div>
      </section>

      {/* SECONDARY ROW: SURVEILLANCE FEED & AUDIO MATRIX */}
      <div className="terminal-secondary-row">
        {/* SURVEILLANCE FEED */}
        <div className="surveillance-panel">
          <div className="panel-header">
            <div className="feed-title-wrap">
              <Tv size={14} />
              <span className="panel-heading">TACTICAL SURVEILLANCE FEED</span>
            </div>
            {/* CHANNEL SELECTOR */}
            <div className="feed-channel-selector">
              {(["AUTO", "OPENING", "COUNTDOWN", "CLOSING", "SAT"] as const).map(
                (ch) => (
                  <button
                    key={ch}
                    type="button"
                    className={`feed-ch-btn ${feedChannel === ch ? "ch-active" : ""}`}
                    onClick={() => {
                      void ensureAudio();
                      setFeedChannel(ch);
                    }}
                  >
                    {ch}
                  </button>
                ),
              )}
            </div>
          </div>

          <div className="camera-viewport">
            {activeVideoSource ? (
              <video
                ref={videoRef}
                src={activeVideoSource}
                autoPlay
                playsInline
                loop={feedChannel !== "AUTO"}
                className="active-surveillance-video"
              />
            ) : (
              <div className="satellite-static-view">
                <div className="static-scanline" />
                <div className="sat-hud-target">
                  <div className="crosshair-h" />
                  <div className="crosshair-v" />
                  <span className="sat-label">SAT-LINK // CTU-SAT-04 ONLINE</span>
                </div>
              </div>
            )}
            <div className="cam-hud-badge">
              CAM-24 // {activeVideoSource ? feedChannel : "STANDBY"}
            </div>
          </div>
        </div>

        {/* AUDIO TELEMETRY MATRIX */}
        <div className="audio-matrix-panel">
          <div className="panel-header">
            <span className="panel-heading">AUDIO TELEMETRY MATRIX</span>
            <button
              type="button"
              className="test-audio-btn"
              onClick={() => void testAlert()}
            >
              TEST ZERO THEME (5S)
            </button>
          </div>

          <div className="audio-controls-list">
            <div className="audio-row">
              <span className="audio-label">ALERT VOLUME</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={audio.crisisVolume}
                onChange={(e) => setAudioVolume(parseFloat(e.target.value))}
                className="audio-slider"
              />
              <span className="audio-val">
                {Math.round(audio.crisisVolume * 100)}%
              </span>
            </div>

            <div className="audio-row">
              <span className="audio-label">COUNTDOWN TICK WINDOW</span>
              <div className="window-pills">
                {[10, 24, 30, 60].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    className={`window-pill ${
                      audio.countdownWindow === sec ? "pill-sel" : ""
                    }`}
                    onClick={() => setAudioWindow(sec)}
                  >
                    {sec}S
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ACTIVE MISSIONS QUEUE */}
      {missions.length > 0 && (
        <section className="active-missions-queue">
          <h2 className="queue-title">ACTIVE MISSIONS & TIMERS QUEUE</h2>
          <div className="queue-grid">
            {missions.map((m: Mission) => {
              const left = remainingMs(m, now);
              return (
                <div
                  key={m.id}
                  className={`mission-card status-${m.status} ${
                    activeFocus?.id === m.id ? "mission-focused" : ""
                  }`}
                >
                  <div className="mission-info">
                    <span className="m-title">{m.title}</span>
                    <span className="m-remaining">{clockParts(left)}</span>
                  </div>
                  <div className="mission-card-actions">
                    {m.status === "ACTIVE" ? (
                      <button
                        type="button"
                        className="m-btn btn-pause"
                        onClick={() => control(m.id, "PAUSE")}
                      >
                        PAUSE
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="m-btn btn-start"
                        onClick={() => control(m.id, "START")}
                      >
                        START
                      </button>
                    )}
                    <button
                      type="button"
                      className="m-btn btn-del"
                      onClick={() => remove(m.id)}
                    >
                      ABORT
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* =========================================================================
          ARM AN OPERATION MODAL (WITH SAMSUNG ONE UI TIME PICKER)
          ========================================================================= */}
      {armModalOpen && (
        <div className="arm-modal-backdrop" onClick={() => setArmModalOpen(false)}>
          <div className="arm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">ARM OPERATIONAL PROTOCOL</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setArmModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="modal-tabs">
              <button
                type="button"
                className={`modal-tab ${armKind === "timer" ? "tab-active" : ""}`}
                onClick={() => setArmKind("timer")}
              >
                COUNTDOWN TIMER
              </button>
              <button
                type="button"
                className={`modal-tab ${armKind === "alarm" ? "tab-active" : ""}`}
                onClick={() => setArmKind("alarm")}
              >
                DAILY ALARM
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="mission-callsign" className="form-label">
                  OPERATION CALLSIGN
                </label>
                <input
                  id="mission-callsign"
                  type="text"
                  placeholder={
                    armKind === "timer"
                      ? "e.g. Field Extraction 25"
                      : "e.g. 06:00 CTU Morning Brief"
                  }
                  value={armTitle}
                  onChange={(e) => setArmTitle(e.target.value)}
                  className="modal-text-input"
                />
              </div>

              {/* SAMSUNG STYLE TIME PICKER */}
              <SamsungTimePicker
                mode={armKind}
                values={timerValues}
                timerValues={timerValues}
                onChange={setTimerValues}
                onTimerChange={setTimerValues}
                alarmTime={alarmTime}
                onAlarmChange={setAlarmTime}
              />
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="modal-cancel-btn"
                onClick={() => setArmModalOpen(false)}
              >
                CANCEL
              </button>
              <button
                type="button"
                className="modal-arm-btn"
                onClick={handleArmSubmit}
              >
                CONFIRM & ARM
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
