import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Mission,
  type Preset,
  nextAlarm,
  protocols,
  remainingMs,
} from "@/lib/mission-engine";
import { CTUAudio, defaultAudio, type AudioSettings } from "@/lib/ctu-audio";

const STORAGE_KEY = "ctu-missions-v2";

export interface AudioState {
  enabled: boolean;
  ambientVolume: number; // 0..1
  crisisVolume: number; // 0..1
  countdownWindow: number; // seconds
  snoozeMs: number;
  phoneAlerts: boolean;
}

const defaultAudioState: AudioState = {
  enabled: true,
  ambientVolume: defaultAudio.ambient / 100,
  crisisVolume: defaultAudio.alarm / 100,
  countdownWindow: defaultAudio.window,
  snoozeMs: defaultAudio.snooze * 60000,
  phoneAlerts: defaultAudio.phone,
};

function toSettings(a: AudioState): AudioSettings {
  return {
    ...defaultAudio,
    enabled: a.enabled,
    ambient: Math.round(a.ambientVolume * 100),
    countdown: Math.max(30, Math.round(a.crisisVolume * 85)),
    alarm: Math.round(a.crisisVolume * 100),
    window: a.countdownWindow,
    phone: a.phoneAlerts,
    snooze: a.snoozeMs / 60000,
  };
}

function isMission(m: unknown): m is Mission {
  const x = m as Mission;
  return (
    !!x &&
    typeof x.id === "string" &&
    typeof x.title === "string" &&
    typeof x.durationMs === "number" &&
    typeof x.remainingMs === "number" &&
    typeof x.endsAt === "number" &&
    typeof x.status === "string"
  );
}

export function useMissions() {
  const [now, setNow] = useState(0);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [customPresets, setCustomPresets] = useState<Preset[]>([]);
  const [audio, setAudio] = useState<AudioState>(defaultAudioState);
  const [loaded, setLoaded] = useState(false);
  const engine = useRef<CTUAudio | null>(null);
  const beat = useRef(0);
  const lastSecond = useRef(0);

  // Helper to ensure audio engine is initialized and unlocked
  const ensureAudio = useCallback(async () => {
    if (!engine.current) {
      engine.current = new CTUAudio();
    }
    try {
      await engine.current.unlock();
    } catch {
      /* Audio context blocked until interaction */
    }
    return engine.current;
  }, []);

  // Global user gesture listener: unlocks Web Audio & pre-warms media on first tap
  useEffect(() => {
    const handleGesture = () => {
      void ensureAudio();
    };

    window.addEventListener("pointerdown", handleGesture, { once: true, passive: true });
    window.addEventListener("keydown", handleGesture, { once: true, passive: true });

    return () => {
      window.removeEventListener("pointerdown", handleGesture);
      window.removeEventListener("keydown", handleGesture);
    };
  }, [ensureAudio]);

  // Load from localStorage + start drift-free ticker (browser only)
  useEffect(() => {
    setNow(Date.now());
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (saved) {
        if (Array.isArray(saved.missions)) setMissions(saved.missions.filter(isMission));
        if (Array.isArray(saved.presets)) setCustomPresets(saved.presets);
        if (saved.audio) {
          setAudio({
            ...defaultAudioState,
            ...saved.audio,
            enabled: saved.audio.enabled ?? true,
          });
        }
      }
    } catch {
      /* fresh terminal */
    }
    setLoaded(true);

    let worker: Worker | undefined;
    let url: string | undefined;
    let fallback: ReturnType<typeof setInterval> | undefined;
    const tick = () => setNow(Date.now());

    try {
      url = URL.createObjectURL(
        new Blob(["setInterval(() => postMessage(Date.now()), 250);"], {
          type: "text/javascript",
        }),
      );
      worker = new Worker(url);
      worker.onmessage = tick;
      worker.onerror = () => {
        worker?.terminate();
        if (!fallback) fallback = setInterval(tick, 250);
      };
    } catch {
      fallback = setInterval(tick, 250);
    }

    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);

    return () => {
      worker?.terminate();
      if (url) URL.revokeObjectURL(url);
      if (fallback) clearInterval(fallback);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
      engine.current?.close();
    };
  }, []);

  // Persist
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ missions, presets: customPresets, audio }),
      );
    } catch {
      /* storage unavailable */
    }
  }, [missions, customPresets, audio, loaded]);

  // Expire missions into CRISIS (At Zero)
  useEffect(() => {
    if (!now) return;
    setMissions((current) => {
      const needsCrisis = current.some((m) => m.status === "ACTIVE" && m.endsAt <= now);
      if (!needsCrisis) return current;

      // When hitting Zero, immediately trigger the At Zero theme
      if (audio.enabled) {
        void ensureAudio().then((eng) => eng.playAtZero(audio.crisisVolume));
      }

      return current.map((m) =>
        m.status === "ACTIVE" && m.endsAt <= now
          ? { ...m, status: "CRISIS", remainingMs: 0 }
          : m,
      );
    });
  }, [now, audio.enabled, audio.crisisVolume, ensureAudio]);

  // Audio heartbeat, fires precisely once per second
  useEffect(() => {
    if (!now) return;

    if (!audio.enabled) {
      engine.current?.stopAll();
      return;
    }

    const sec = Math.floor(now / 1000);
    if (sec === lastSecond.current) return;
    lastSecond.current = sec;
    beat.current += 1;

    if (!engine.current) {
      engine.current = new CTUAudio();
    }

    const settings = toSettings(audio);

    // Crisis alert takes top priority: plays 24 At Zero theme
    if (missions.some((m) => m.status === "CRISIS")) {
      void ensureAudio().then((eng) => eng.tick(3, settings, beat.current));
      return;
    }

    // Active mission ticking
    const active = missions.filter((m) => m.status === "ACTIVE");
    if (!active.length) {
      engine.current?.stopAll();
      return;
    }

    const closest = Math.min(...active.map((m) => remainingMs(m, now)));
    const tier = closest <= audio.countdownWindow * 1000 ? 2 : 1;
    void ensureAudio().then((eng) => eng.tick(tier, settings, beat.current));
  }, [now, audio, missions, ensureAudio]);

  const arm = useCallback(
    (opts: { title: string; kind: "timer" | "alarm"; durationMs: number; alarmTime?: string }) => {
      // User gesture: wake audio and chirp confirmation
      void ensureAudio().then((eng) => eng.chirp(0.6));

      const at = Date.now();
      const endsAt =
        opts.kind === "alarm" && opts.alarmTime ? nextAlarm(opts.alarmTime, at) : at + opts.durationMs;
      const mission: Mission = {
        id: crypto.randomUUID(),
        title: opts.title,
        kind: opts.kind,
        durationMs: opts.durationMs,
        remainingMs: endsAt - at,
        endsAt,
        status: "ACTIVE",
        ...(opts.alarmTime ? { alarmTime: opts.alarmTime } : {}),
      };
      setMissions((items) => [...items, mission]);
      return mission.id;
    },
    [ensureAudio],
  );

  const control = useCallback(
    (id: string, action: "start" | "pause" | "reset" | "stop") => {
      void ensureAudio();
      const at = Date.now();
      setMissions((items) => {
        const next = items.map((m) => {
          if (m.id !== id) return m;
          if (action === "start") {
            const endsAt = at + (m.remainingMs > 0 ? m.remainingMs : m.durationMs);
            return { ...m, status: "ACTIVE", endsAt, remainingMs: endsAt - at };
          }
          if (action === "pause") {
            const rem = Math.max(0, m.endsAt - at);
            return { ...m, status: "PAUSED", remainingMs: rem };
          }
          if (action === "reset") {
            return {
              ...m,
              status: "STOPPED",
              remainingMs: m.durationMs,
              endsAt: at + m.durationMs,
            };
          }
          if (action === "stop") {
            return { ...m, status: "STOPPED", remainingMs: 0 };
          }
          return m;
        });

        // If no more missions in CRISIS, stop the Zero theme immediately
        const stillInCrisis = next.some((m) => m.status === "CRISIS");
        if (!stillInCrisis) {
          engine.current?.stopAtZero();
        }

        return next;
      });
    },
    [ensureAudio],
  );

  const snooze = useCallback(
    (id: string) => {
      void ensureAudio();
      const at = Date.now();
      setMissions((items) => {
        const next = items.map((m) => {
          if (m.id !== id) return m;
          const endsAt = at + audio.snoozeMs;
          return {
            ...m,
            status: "ACTIVE",
            endsAt,
            remainingMs: audio.snoozeMs,
          };
        });

        // Silence Zero theme on snooze
        const stillInCrisis = next.some((m) => m.status === "CRISIS");
        if (!stillInCrisis) {
          engine.current?.stopAtZero();
        }

        return next;
      });
    },
    [audio.snoozeMs, ensureAudio],
  );

  const remove = useCallback((id: string) => {
    setMissions((items) => {
      const next = items.filter((m) => m.id !== id);
      const stillInCrisis = next.some((m) => m.status === "CRISIS");
      if (!stillInCrisis) {
        engine.current?.stopAtZero();
      }
      return next;
    });
  }, []);

  const togglePin = useCallback((id: string) => {
    setMissions((items) =>
      items.map((m) => (m.id === id ? { ...m, pinned: !m.pinned } : m)),
    );
  }, []);

  const saveCustomPreset = useCallback(
    (preset: { name: string; durationMs: number; description: string }) => {
      const p: Preset = {
        id: `custom-${Date.now()}`,
        name: preset.name,
        durationMs: preset.durationMs,
        description: preset.description,
        isCustom: true,
      };
      setCustomPresets((prev) => [...prev, p]);
    },
    [],
  );

  const setAudioVolume = useCallback((bus: "ambient" | "crisis", val: number) => {
    const clamped = Math.max(0, Math.min(1, val));
    setAudio((a) =>
      bus === "ambient" ? { ...a, ambientVolume: clamped } : { ...a, crisisVolume: clamped },
    );
  }, []);

  const setAudioWindow = useCallback((windowSec: number) => {
    setAudio((a) => ({ ...a, countdownWindow: windowSec }));
  }, []);

  const setSnoozeDuration = useCallback((minutes: number) => {
    setAudio((a) => ({ ...a, snoozeMs: minutes * 60000 }));
  }, []);

  const setPhoneAlerts = useCallback((enabled: boolean) => {
    setAudio((a) => ({ ...a, phoneAlerts: enabled }));
  }, []);

  const toggleAudio = useCallback(() => {
    void ensureAudio();
    setAudio((a) => {
      const nextEnabled = !a.enabled;
      if (!nextEnabled) {
        engine.current?.stopAll();
      }
      return { ...a, enabled: nextEnabled };
    });
  }, [ensureAudio]);

  const testAlert = useCallback(() => {
    void ensureAudio().then((eng) => {
      eng.playAtZero(audio.crisisVolume);
      // Automatically stop test blast after 5 seconds
      setTimeout(() => {
        eng.stopAtZero();
      }, 5000);
    });
  }, [audio.crisisVolume, ensureAudio]);

  return {
    now,
    missions,
    presets: [...protocols, ...customPresets],
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
  };
}
