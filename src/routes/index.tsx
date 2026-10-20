import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AudioLines,
  Bell,
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
        title: "CTU Operational Timer · Tactical Mission Terminal",
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

  const [timeZone, setTimeZone] = useState<string>(() => {
    if (typeof window === "undefined") return "Asia/Bangkok";
    try {
      const saved = localStorage.getItem("ctu-settings-v1");
      return saved && JSON.parse(saved).timeZone ? JSON.parse(saved).timeZone : "Asia/Bangkok";
    } catch {
      return "Asia/Bangkok";
    }
  });

  const [fullscreen, setFullscreen] = useState(false);
  const [guard, setGuard] = useState(false);
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);
  const [audioOpen, setAudioOpen] = useState(false);

  // Arm modal state
  const [addOpen, setAddOpen] = useState(false);
  const [kind, setKind] = useState<"timer" | "alarm">("timer");
  const [title, setTitle] = useState("");
  const [timerValues, setTimerValues] = useState<SamsungTimerValues>({
    hours: 0,
    minutes: 25,
    seconds: 0,
    totalSeconds: 1500,
  });
  const [alarmTime, setAlarmTime] = useState<string>("09:00:00");
  const [savePreset, setSavePreset] = useState(false);

  // Sync settings
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

  const activeFocus = useMemo(() => focusMission(missions, now), [missions, now]);
  const crisis = useMemo(() => missions.some((m) => m.status === "CRISIS"), [missions]);
  const heightened = useMemo(() => {
    const active = missions.filter((m) => m.status === "ACTIVE");
    return active.some((m) => remainingMs(m, now) < 5 * 60 * 1000);
  }, [missions, now]);

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
      /* fullscreen blocked */
    }
  }, []);

  const toggleGuard = useCallback(async () => {
    if ("wakeLock" in navigator) {
      try {
        if (!guard) {
          const wl = await navigator.wakeLock.request("screen");
          setWakeLock(wl);
          setGuard(true);
          wl.addEventListener("release", () => setGuard(false));
        } else if (wakeLock) {
          await wakeLock.release();
          setWakeLock(null);
          setGuard(false);
        }
      } catch {
        setGuard(false);
      }
    }
  }, [guard, wakeLock]);

  // Operational theater local time
  const localClock = useMemo(() => {
    const ts = now || Date.now();
    const d = new Date(ts);
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        hour12: !format24,
      }).formatToParts(d);

      let h = 0;
      let m = 0;
      let s = 0;
      let dayPeriod = "";

      for (const p of parts) {
        if (p.type === "hour") h = parseInt(p.value, 10);
        else if (p.type === "minute") m = parseInt(p.value, 10);
        else if (p.type === "second") s = parseInt(p.value, 10);
        else if (p.type === "dayPeriod") dayPeriod = p.value;
      }

      const pad = (n: number) => String(n).padStart(2, "0");
      return {
        digits: `${pad(h)}:${pad(m)}:${pad(s)}`,
        period: dayPeriod ? ` ${dayPeriod.toUpperCase()}` : "",
      };
    } catch {
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
    }
  }, [now, format24, timeZone]);

  const zulu = useMemo(() => {
    const d = new Date(now || Date.now());
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
      const offsetMs = getTzOffsetMs(new Date(now || Date.now()), timeZone);
      const nowInTz = (now || Date.now()) + offsetMs;
      const d = new Date(nowInTz);
      const parts = alarmTime.split(":").map(Number);
      const hours = parts[0] ?? 0;
      const minutes = parts[1] ?? 0;
      const seconds = parts[2] ?? 0;
      d.setUTCHours(hours, minutes, seconds, 0);
      let targetInTz = d.getTime();
      if (targetInTz <= nowInTz) {
        targetInTz += 24 * 3600 * 1000;
      }
      const targetUtc = targetInTz - offsetMs;
      const ms = Math.max(0, targetUtc - (now || Date.now()));
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
              TACTICAL FIELD OPERATIONS · SECTOR 4
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
                {/* Audio quick-toggle directly on Command Deck */}
                <button
                  type="button"
                  className={`time-mode-btn flex items-center gap-1.5 ${audio.enabled ? "border-[var(--signal)] text-[var(--signal)]" : "text-muted-foreground opacity-80"}`}
                  onClick={toggleAudio}
                  title="Toggle Tactical Audio"
                >
                  {audio.enabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
                  <span>{audio.enabled ? "AUDIO ON" : "AUDIO MUTED"}</span>
                </button>
                <button
                  type="button"
                  className="time-mode-btn"
                  onClick={() => setFormat24((f) => !f)}
                  title="Toggle 24-hour / 12-hour local display"
                >
                  {format24 ? "24H FORMAT" : "12H FORMAT"}
                </button>
                <span className="micro text-muted-foreground uppercase hidden sm:inline">
                  {activeFocus?.pinned ? "PINNED" : "AUTO-PRIORITY"}
                </span>
              </div>
            </div>

            <div className="unified-stage-grid">
              {/* Local Mission Clock */}
              <div className="stage-sector local-time-sector">
                <div className="sector-header flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="sector-tag">LOCAL MISSION TIME</span>
                    <select
                      value={timeZone}
                      onChange={(e) => setTimeZone(e.target.value)}
                      className="time-mode-btn text-xs py-0.5 px-1.5 cursor-pointer bg-black/60 border border-[var(--border)] rounded text-[var(--signal)] uppercase"
                      title="Select operational theater / timezone"
                    >
                      {TIMEZONE_SECTORS.map((s) => (
                        <option
                          key={s.id}
                          value={s.id}
                          className="bg-black text-[var(--signal)]"
                        >
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
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
                <div className="sector-footer-telemetry">
                  EVENTS OCCUR IN REAL TIME · {timeZone.split("/")[1]?.replace("_", " ").toUpperCase() || "THEATER"}
                </div>
              </div>

              {/* Active Operation Countdown */}
              <div className="stage-sector active-op-sector">
                <div className="sector-header flex items-center justify-between">
                  <span className="sector-tag">
                    {activeFocus ? activeFocus.title.toUpperCase() : "TARGET COUNTDOWN"}
                  </span>
                  <span className="sector-status-pill">
                    {activeFocus ? activeFocus.status : "STANDBY"}
                  </span>
                </div>
                <div className="stage-clock-display">
                  {activeFocus ? (
                    <CTUDigits
                      time={focusDigits}
                      className="focus-clock h-16 sm:h-20 lg:h-24"
                    />
                  ) : (
                    <div className="standby-digits">00:00:00</div>
                  )}
                  <div className="digit-labels">
                    <span>HOURS</span>
                    <span>MINUTES</span>
                    <span>SECONDS</span>
                  </div>
                </div>

                {activeFocus ? (
                  <div className="focus-controls">
                    {activeFocus.status === "ACTIVE" && (
                      <Button
                        size="lg"
                        className="control-btn"
                        onClick={() => control(activeFocus.id, "pause")}
                      >
                        <Pause /> PAUSE
                      </Button>
                    )}
                    {(activeFocus.status === "PAUSED" ||
                      activeFocus.status === "STOPPED") && (
                      <Button
                        size="lg"
                        className="control-btn primary-action"
                        onClick={() => control(activeFocus.id, "start")}
                      >
                        <Play /> RESUME
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
                      variant="outline"
                      className="control-btn"
                      onClick={() => control(activeFocus.id, "stop")}
                    >
                      <Square /> STOP
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
                  ? `TARGET: ${new Date(activeFocus.endsAt).toLocaleTimeString("en-US", { timeZone })}`
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
              />
              <span>TACTICAL RING WARBLE</span>
            </label>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" size="sm" onClick={testAlert}>
              TEST CRISIS ALARM (3 BURSTS)
            </Button>
          </div>
        </section>
      )}

      {addOpen && (
        <div className="arm-modal-backdrop" onClick={() => setAddOpen(false)}>
          <section className="arm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="arm-modal-header">
              <div className="arm-modal-title">
                <Plus />
                <span>ARM AN OPERATION</span>
              </div>
              <button
                type="button"
                className="arm-modal-close"
                onClick={() => setAddOpen(false)}
                aria-label="Close dialog"
              >
                <X />
              </button>
            </div>

            <form onSubmit={submit} className="arm-form">
              <div className="arm-tabs">
                <button
                  type="button"
                  className={`arm-tab ${kind === "timer" ? "active" : ""}`}
                  onClick={() => setKind("timer")}
                >
                  <Timer />
                  <span>COUNTDOWN</span>
                </button>
                <button
                  type="button"
                  className={`arm-tab ${kind === "alarm" ? "active" : ""}`}
                  onClick={() => setKind("alarm")}
                >
                  <Bell />
                  <span>DAILY ALARM</span>
                </button>
              </div>

              <div className="arm-field">
                <label htmlFor="mission-title">OPERATION CODENAME</label>
                <input
                  id="mission-title"
                  type="text"
                  placeholder={
                    kind === "timer"
                      ? "e.g., Tactical Sprint, Target Intercept"
                      : "e.g., Shift Briefing, Sector Hand-Off"
                  }
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={64}
                />
              </div>

              <SamsungTimePicker
                mode={kind}
                timerValues={timerValues}
                onTimerChange={setTimerValues}
                alarmTime={alarmTime}
                onAlarmChange={setAlarmTime}
              />

              {kind === "timer" && (
                <label className="save-preset-checkbox">
                  <input
                    type="checkbox"
                    checked={savePreset}
                    onChange={(e) => setSavePreset(e.target.checked)}
                  />
                  <span>SAVE AS REUSABLE QUICK-ARM PROTOCOL</span>
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
