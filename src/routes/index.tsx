import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AudioLines,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
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
  Mission,
  clockParts,
  focusMission,
  nextAlarm,
  protocols,
  remainingMs,
} from "@/lib/mission-engine";
import surveillance from "@/assets/la-surveillance.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: "CTU Operational Timer · Los Angeles Domestic Unit",
      },
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
    saveCustomPreset,
    setAudioVolume,
    setAudioWindow,
    setSnoozeDuration,
    setPhoneAlerts,
    toggleAudio,
    testAlert,
    now,
  } = useMissions();

  const [format24, setFormat24] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      const saved = localStorage.getItem("ctu-settings-v1");
      return saved ? JSON.parse(saved).format24 ?? true : true;
    } catch {
      return true;
    }
  });

  const [stealth, setStealth] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const saved = localStorage.getItem("ctu-settings-v1");
      return saved ? JSON.parse(saved).stealth ?? false : false;
    } catch {
      return false;
    }
  });

  const [fullscreen, setFullscreen] = useState(false);
  const [audioOpen, setAudioOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [kind, setKind] = useState<"timer" | "alarm">("timer");
  const [title, setTitle] = useState("");

  // Samsung Galaxy Timer State (Hours, Minutes, Seconds)
  const [timerValues, setTimerValues] = useState<SamsungTimerValues>({
    hours: 0,
    minutes: 25,
    seconds: 0,
    totalSeconds: 1500,
  });

  // Samsung Galaxy Alarm State (HH:MM:SS)
  const [alarmTime, setAlarmTime] = useState("09:00:00");
  const [savePreset, setSavePreset] = useState(false);
  const [guard, setGuard] = useState(false);
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(
        "ctu-settings-v1",
        JSON.stringify({ format24, stealth })
      );
    } catch {
      // ignore
    }
  }, [format24, stealth]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setFullscreen(true);
      } else {
        await document.exitFullscreen();
        setFullscreen(false);
      }
    } catch {
      // ignore
    }
  }, []);

  const toggleGuard = useCallback(async () => {
    if (guard && wakeLock) {
      try {
        await wakeLock.release();
      } catch {
        // ignore
      }
      setWakeLock(null);
      setGuard(false);
      setNotice("TERMINAL GUARD DISENGAGED");
      setTimeout(() => setNotice(null), 3000);
      return;
    }

    if ("wakeLock" in navigator) {
      try {
        const lock = await navigator.wakeLock.request("screen");
        setWakeLock(lock);
        setGuard(true);
        setNotice("TERMINAL GUARD ENGAGED · SCREEN KEPT AWAKE");
        setTimeout(() => setNotice(null), 3500);
        lock.addEventListener("release", () => {
          setGuard(false);
          setWakeLock(null);
        });
      } catch {
        setNotice("TERMINAL GUARD UNAVAILABLE ON THIS DEVICE");
        setTimeout(() => setNotice(null), 3000);
      }
    }
  }, [guard, wakeLock]);

  const activeFocus = useMemo(() => focusMission(missions), [missions]);

  const crisis = useMemo(
    () => missions.some((m) => m.status === "CRISIS"),
    [missions]
  );

  const heightened = useMemo(() => {
    if (crisis) return false;
    return missions.some((m) => {
      if (m.status !== "ACTIVE") return false;
      return remainingMs(m, now) <= 5 * 60 * 1000;
    });
  }, [missions, crisis, now]);

  const localClock = useMemo(() => {
    const d = new Date(now);
    let hours = d.getHours();
    let period = "";
    if (!format24) {
      period = hours >= 12 ? " PM" : " AM";
      hours = hours % 12 || 12;
    }
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      digits: `${pad(hours)}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
      period,
    };
  }, [now, format24]);

  const zulu = useMemo(() => {
    const d = new Date(now);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  }, [now]);

  const focusRemaining = activeFocus ? remainingMs(activeFocus, now) : 0;
  const focusDigits = clockParts(focusRemaining);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (kind === "timer") {
      const totalSec = timerValues.totalSeconds;
      if (totalSec <= 0) return;
      const ms = totalSec * 1000;
      const finalTitle =
        title.trim() ||
        `Operation: ${timerValues.hours > 0 ? `${timerValues.hours}h ` : ""}${timerValues.minutes}m ${timerValues.seconds}s`;
      arm({
        title: finalTitle,
        kind: "timer",
        durationMs: ms,
      });
      if (savePreset) {
        saveCustomPreset({
          name: finalTitle,
          durationMs: ms,
          description: `Custom ${timerValues.hours}h ${timerValues.minutes}m ${timerValues.seconds}s countdown`,
        });
      }
    } else {
      const target = nextAlarm(alarmTime, Date.now());
      const ms = Math.max(0, target - Date.now());
      arm({
        title: title.trim() || `Daily Alarm · ${alarmTime}`,
        kind: "alarm",
        durationMs: ms,
        alarmTime,
      });
    }
    setTitle("");
    setTimerValues({ hours: 0, minutes: 25, seconds: 0, totalSeconds: 1500 });
    setSavePreset(false);
    setAddOpen(false);
  };

  const threatClass = crisis
    ? "crisis-state"
    : heightened
      ? "heightened-state"
      : "watch-state";
  const stealthClass = stealth ? "night-ops" : "";

  return (
    <main className={`ctu-terminal ${threatClass} ${stealthClass}`}>
      <header className="terminal-header">
        <div className="terminal-brand">
          <span className="brand-badge">24</span>
          <div>
            <span className="brand-title">CTU TERMINAL</span>
            <span className="brand-sub">
              LOS ANGELES DOMESTIC FIELD UNIT · SECTOR 4
            </span>
          </div>
        </div>

        <div className="terminal-clock-block">
          <div className="zulu-pill">
            <span className="micro muted">ZULU / UTC</span>
            <span className="zulu-clock">{zulu} Z</span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleFullscreen}
            aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            title="Toggle terminal fullscreen"
          >
            {fullscreen ? <Minimize2 /> : <Maximize2 />}
          </Button>
        </div>
      </header>

      <div className="operations-layout">
        <section className="primary-column">
          <div className="terminal-panel focus-panel">
            <div className="panel-heading">
              <div className="flex items-center gap-2">
                <span className="live-dot" />
                <span>UNIFIED COMMAND DECK</span>
              </div>
              <div className="deck-toggles flex items-center gap-2">
                <button
                  type="button"
                  className="time-mode-btn"
                  onClick={() => setFormat24((f) => !f)}
                  title="Toggle 24-hour / 12-hour local display"
                >
                  {format24 ? "24H FORMAT" : "12H FORMAT"}
                </button>
                <span className="micro text-muted-foreground uppercase">
                  {activeFocus?.pinned ? "MANUALLY PINNED" : "AUTO-SELECT PRIORITY"}
                </span>
              </div>
            </div>

            <div className="unified-stage-grid">
              <div className="stage-sector local-time-sector">
                <div className="sector-header">
                  <span className="sector-tag">LOCAL MISSION TIME</span>
                  <span className="sector-format-indicator">
                    {format24 ? "MILITARY (24H)" : `CIVILIAN${localClock.period}`}
                  </span>
                </div>
                <div className="stage-clock-display">
                  <CTUDigits
                    time={localClock.digits}
                    className="mission-clock h-16 sm:h-20 lg:h-24"
                  />
                  <div className="digit-labels">
                    <span>HOURS</span>
                    <span>MINUTES</span>
                    <span>SECONDS</span>
                  </div>
                </div>
                <div className="realtime-banner">
                  <span className="ticker-marker">■</span>
                  <span>THE FOLLOWING EVENTS TAKE PLACE IN REAL TIME</span>
                  <span className="ticker-marker">■</span>
                </div>
              </div>

              <div className="stage-sector active-operation-sector">
                <div className="sector-header">
                  <span className="sector-tag">ACTIVE OPERATION TARGET</span>
                  {activeFocus && (
                    <span className="sector-protocol-pill">
                      {activeFocus.kind.toUpperCase()} · {activeFocus.status}
                    </span>
                  )}
                </div>

                <div className="stage-clock-display">
                  {activeFocus ? (
                    <CTUDigits
                      time={focusDigits}
                      className="focus-clock h-20 sm:h-24 lg:h-28"
                    />
                  ) : (
                    <div className="focus-standby">
                      <div className="standby-digits">00:00:00</div>
                      <span className="standby-tag">NO ACTIVE MISSIONS ARMED</span>
                    </div>
                  )}
                  <div className="digit-labels">
                    <span>HOURS</span>
                    <span>MINUTES</span>
                    <span>SECONDS</span>
                  </div>
                </div>

                {activeFocus ? (
                  <div className="focus-controls">
                    {["PAUSED", "STOPPED"].includes(activeFocus.status) ? (
                      <Button
                        size="lg"
                        className="control-btn primary-action"
                        onClick={() => control(activeFocus.id, "start")}
                      >
                        <Play /> RESUME
                      </Button>
                    ) : (
                      <Button
                        size="lg"
                        variant="outline"
                        className="control-btn"
                        disabled={activeFocus.status === "CRISIS"}
                        onClick={() => control(activeFocus.id, "pause")}
                      >
                        <Pause /> PAUSE
                      </Button>
                    )}

                    <Button
                      size="lg"
                      variant="outline"
                      className="control-btn"
                      onClick={() => control(activeFocus.id, "reset")}
                    >
                      <RotateCcw /> RESET
                    </Button>

                    <Button
                      size="lg"
                      variant="destructive"
                      className="control-btn"
                      onClick={() => control(activeFocus.id, "stop")}
                    >
                      <Square /> DISARM
                    </Button>

                    {activeFocus.status === "CRISIS" && (
                      <Button
                        size="lg"
                        className="control-btn crisis-snooze"
                        onClick={() => snooze(activeFocus.id)}
                      >
                        <Zap /> SNOOZE ({Math.floor(audio.snoozeMs / 60000)}M)
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="focus-controls">
                    <Button
                      size="lg"
                      className="control-btn primary-action w-full"
                      onClick={() => setAddOpen(true)}
                    >
                      <Plus /> ARM NEW OPERATION
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="focus-footer">
              <div className="threat-indicator-chip">
                <span className="threat-square" />
                <span>
                  THREAT CON{" "}
                  {crisis ? "1 · CODE RED" : heightened ? "2 · ORANGE" : "4 · AMBER"}
                </span>
              </div>
              <div className="focus-active-title">
                {activeFocus ? activeFocus.title : "COMMAND STANDBY"}
              </div>
              <div className="focus-target-time">
                {activeFocus && activeFocus.endsAt > 0
                  ? `TARGET: ${new Date(activeFocus.endsAt).toLocaleTimeString()}`
                  : "STANDBY"}
              </div>
            </div>
          </div>

          <div className="terminal-panel presets-panel mt-4">
            <div className="panel-heading">
              <span>
                <Zap size={14} /> QUICK-ARM PROTOCOLS
              </span>
              <span className="micro text-muted-foreground">INSTANT ENGAGEMENT</span>
            </div>
            <div className="preset-grid">
              {presets.map((preset) => (
                <button
                  type="button"
                  key={preset.id}
                  className="preset-btn"
                  onClick={() =>
                    arm({
                      title: preset.name,
                      kind: "timer",
                      durationMs: preset.durationMs,
                    })
                  }
                >
                  <span className="preset-name">{preset.name}</span>
                  <span className="preset-dur">
                    {Math.floor(preset.durationMs / 60000)} MIN
                  </span>
                  <span className="preset-desc">{preset.description}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="secondary-column">
          <section className="terminal-panel queue-panel">
            <div className="panel-heading">
              <span>ACTIVE ROSTER ({missions.length})</span>
              <span className="micro text-muted-foreground">AUTO-FOCUS</span>
            </div>
            <div className="queue-body">
              {missions.length === 0 ? (
                <div className="queue-empty">NO OPERATIONS IN ROSTER</div>
              ) : (
                missions.map((m) => (
                  <div
                    key={m.id}
                    className={`queue-item ${m.id === activeFocus?.id ? "active-queue-item" : ""}`}
                  >
                    <div className="queue-item-top">
                      <span className="queue-kind">{m.kind.toUpperCase()}</span>
                      <div className="queue-item-actions">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={m.pinned ? "Unpin operation" : "Pin operation"}
                          className={m.pinned ? "accent" : ""}
                          onClick={() => togglePin(m.id)}
                        >
                          <Pin />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${m.title}`}
                          onClick={() => remove(m.id)}
                        >
                          <X />
                        </Button>
                      </div>
                    </div>
                    <div className="queue-name">{m.title}</div>
                    <div className="queue-item-bottom">
                      <span className={`queue-status ${m.status === "CRISIS" ? "accent" : ""}`}>
                        <span className="status-dot" />
                        {m.status}
                      </span>
                      <span>{clockParts(remainingMs(m, now))}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${["PAUSED", "STOPPED"].includes(m.status) ? "Start" : "Pause"} ${m.title}`}
                        disabled={m.status === "CRISIS"}
                        onClick={() =>
                          control(
                            m.id,
                            ["PAUSED", "STOPPED"].includes(m.status) ? "start" : "pause"
                          )
                        }
                      >
                        {["PAUSED", "STOPPED"].includes(m.status) ? <Play /> : <Pause />}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="queue-add">
              <Button variant="outline" className="w-full" onClick={() => setAddOpen(true)}>
                <Plus /> ARM NEW OPERATION
              </Button>
            </div>
          </section>

          <section className="terminal-panel surveillance-panel">
            <div className="panel-heading">
              <span>
                <Eye size={13} /> SURVEILLANCE FEED
              </span>
              <span className="accent micro">
                <span className="status-dot" /> LIVE
              </span>
            </div>
            <div className="surveillance-image">
              <img
                src={surveillance}
                alt="Watercolor aerial surveillance of downtown Los Angeles"
                width="1536"
                height="1024"
              />
              <div className="feed-crosshair" />
              <span className="feed-tag">CAM 07 / LOS ANGELES</span>
              <span className="feed-coordinates">34°03′ N &nbsp; 118°15′ W</span>
              <span className="feed-time">{zulu} Z</span>
            </div>
            <div className="feed-footer">
              <span>
                <Globe size={12} /> SECTOR 07 · DOWNTOWN
              </span>
              <span className="signal-bars">▂ ▄ ▆ █</span>
            </div>
          </section>
        </aside>
      </div>

      <section className="telemetry-bar">
        <div className="telemetry-status">
          <ShieldCheck size={17} />
          <div>
            <span className="micro muted">TERMINAL STATUS</span>
            <span>
              ONLINE <span className="muted">/</span> SECURE
            </span>
          </div>
        </div>
        <div className="threat-status">
          <span className="micro muted">THREAT CONDITION</span>
          <span className="accent">
            <span className="tiny-square" /> CON{" "}
            {crisis ? "1 · CODE RED" : heightened ? "2 · HEIGHTENED" : "4 · WATCH"}
          </span>
        </div>
        <div className="telemetry-actions">
          <Button
            variant="ghost"
            className={guard ? "accent" : ""}
            onClick={toggleGuard}
            title="Keep the screen awake"
          >
            <Shield size={15} />
            <span>TERMINAL GUARD</span>
            <span className={`toggle-track ${guard ? "on" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            className={stealth ? "accent" : ""}
            onClick={() => setStealth((s) => !s)}
          >
            <Moon size={15} />
            <span>NIGHT OPS</span>
            <span className={`toggle-track ${stealth ? "on" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={audio.enabled ? "Mute audio" : "Enable audio"}
            title={audio.enabled ? "Mute audio" : "Enable audio"}
            onClick={toggleAudio}
          >
            {audio.enabled ? <Volume2 /> : <VolumeX />}
          </Button>
          <Button
            variant="ghost"
            onClick={() => setAudioOpen((o) => !o)}
            className={audioOpen ? "accent" : ""}
          >
            <AudioLines />
            <span>AUDIO MATRIX</span>
            <ChevronDown />
          </Button>
        </div>
      </section>

      {audioOpen && (
        <section className="audio-matrix">
          <div className="section-label">
            <span>
              <AudioLines size={14} /> CTU AUDIO MATRIX
            </span>
            <span className="muted">SYNTHESIZED SIGNALS</span>
          </div>
          <div className="audio-sliders">
            <label>
              <span>AMBIENT TICK ({Math.round(audio.ambientVolume * 100)}%)</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={audio.ambientVolume}
                onChange={(e) => setAudioVolume("ambient", Number(e.target.value))}
              />
            </label>
            <label>
              <span>CRISIS THEME ({Math.round(audio.crisisVolume * 100)}%)</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={audio.crisisVolume}
                onChange={(e) => setAudioVolume("crisis", Number(e.target.value))}
              />
            </label>
          </div>
          <div className="audio-toggles">
            <div className="toggle-group">
              <span className="micro muted">COUNTDOWN WINDOW</span>
              <div className="pill-group">
                {[60, 30, 10].map((sec) => (
                  <button
                    type="button"
                    key={sec}
                    className={`pill-btn ${audio.countdownWindow === sec ? "active" : ""}`}
                    onClick={() => setAudioWindow(sec)}
                  >
                    {sec}S
                  </button>
                ))}
              </div>
            </div>
            <div className="toggle-group">
              <span className="micro muted">SNOOZE DURATION</span>
              <div className="pill-group">
                {[5, 9, 10].map((m) => (
                  <button
                    type="button"
                    key={m}
                    className={`pill-btn ${audio.snoozeMs === m * 60000 ? "active" : ""}`}
                    onClick={() => setSnoozeDuration(m)}
                  >
                    {m}M
                  </button>
                ))}
              </div>
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={audio.phoneAlerts}
                onChange={(e) => setPhoneAlerts(e.target.checked)}
              />{" "}
              PHONE ALERT SOUND (FALLBACK)
            </label>
            <Button variant="outline" size="sm" onClick={testAlert}>
              <Zap /> TEST 3S ALERT SIGNAL
            </Button>
          </div>
        </section>
      )}

      <footer className="terminal-footer">
        <span>CTU LOS ANGELES · OPERATIONAL DATA SYSTEM V4.18</span>
        <span>
          CIPHER: <span className="accent">AES-256-GCM</span> · STATUS:{" "}
          <span className="accent">ALL CHANNELS SECURE</span>
        </span>
      </footer>

      {notice && (
        <div role="status" className="terminal-notice">
          {notice}
        </div>
      )}

      {addOpen && (
        <div className="modal-backdrop" onClick={() => setAddOpen(false)}>
          <section
            className="arm-dialog terminal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="arm-heading"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-heading">
              <span>
                <Plus size={14} /> NEW OPERATION
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close new operation"
                onClick={() => setAddOpen(false)}
              >
                <X />
              </Button>
            </div>
            <form onSubmit={submit}>
              <h2 id="arm-heading">ARM AN OPERATION</h2>
              <div className="dialog-tabs">
                <Button
                  type="button"
                  variant={kind === "timer" ? "default" : "outline"}
                  onClick={() => setKind("timer")}
                >
                  <Timer />
                  COUNTDOWN
                </Button>
                <Button
                  type="button"
                  variant={kind === "alarm" ? "default" : "outline"}
                  onClick={() => setKind("alarm")}
                >
                  <Bell />
                  DAILY ALARM
                </Button>
              </div>

              <label className="field-group">
                <span className="input-header-label">MISSION TITLE</span>
                <input
                  autoFocus
                  maxLength={70}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Operation: Afternoon Sprint"
                  className="terminal-text-input"
                />
              </label>

              {/* Samsung Galaxy One UI Drum Picker */}
              <div className="time-picker-section">
                <SamsungTimePicker
                  mode={kind === "timer" ? "countdown" : "alarm"}
                  timerValues={timerValues}
                  onTimerChange={setTimerValues}
                  alarmTime={alarmTime}
                  onAlarmChange={setAlarmTime}
                />
              </div>

              {kind === "timer" && (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={savePreset}
                    onChange={(e) => setSavePreset(e.target.checked)}
                  />{" "}
                  SAVE AS QUICK-ARM PROTOCOL
                </label>
              )}

              <Button type="submit" className="arm-submit">
                <Plus />
                ARM OPERATION
                <ChevronRight />
              </Button>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
