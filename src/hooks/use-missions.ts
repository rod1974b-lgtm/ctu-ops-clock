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
    countdown: Math.max(30, Math.round(a.crisisVolume * 75)),
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

  // Helper to ensure audio engine is initialized and unlocked on user interaction
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
            // Keep user preference for enabled sound
            enabled: saved.audio.enabled ?? true,
          });
        }
      }
    } catch {
      /* corrupted storage starts fresh terminal */
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

  // Expire missions into CRISIS
  useEffect(() => {
    if (!now) return;
    setMissions((current) =>
      current.some((m) => m.status === "ACTIVE" && m.endsAt <= now)
        ? current.map((m) =>
            m.status === "ACTIVE" && m.endsAt <= now
              ? { ...m, status: "CRISIS", remainingMs: 0 }
              : m,
          )
        : current,
    );
  }, [now]);

  // Audio heartbeat, fires precisely once per second
  useEffect(() => {
    if (!now || !audio.enabled) return;

    const sec = Math.floor(now / 1000);
    if (sec === lastSecond.current) return;
    lastSecond.current = sec;
    beat.current += 1;

    if (!engine.current) {
      engine.current = new CTUAudio();
    }

    const settings = toSettings(audio);

    // Crisis alert takes top priority
    if (missions.some((m) => m.status === "CRISIS")) {
      if (beat.current % 2 === 0) {
        engine.current.tick(3, settings, beat.current);
      }
      return;
    }

    // Active mission ticking
    const active = missions.filter((m) => m.status === "ACTIVE");
    if (!active.length) return;

    const closest = Math.min(...active.map((m) => remainingMs(m, now)));
    const tier = closest <= audio.countdownWindow * 1000 ? 2 : 1;
    engine.current.tick(tier, settings, beat.current);
  }, [now, audio, missions]);

  const arm = useCallback(
    (opts: { title: string; kind: "timer" | "alarm"; durationMs: number; alarmTime?: string }) => {
      // User gesture: wake audio and chirp confirmation
      void ensureAudio().then((eng) => eng.chirp(0.5));

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
      const at = Date.now();
      if (action === "start") {
        void ensureAudio().then((eng) => eng.chirp(0.4));
      }
      setMissions((items) =>
        items.map((m) => {
          if (m.id !== id) return m;
          if (action === "pause") {
            return { ...m, remainingMs: remainingMs(m, at), status: "PAUSED" };
          }
          if (action === "start") {
            if (m.kind === "alarm" && m.alarmTime && m.status !== "PAUSED") {
              const endsAt = nextAlarm(m.alarmTime, at);
              return { ...m, endsAt, remainingMs: endsAt - at, status: "ACTIVE" };
            }
            const left = m.remainingMs > 0 ? m.remainingMs : m.durationMs;
            return { ...m, endsAt: at + left, remainingMs: left, status: "ACTIVE" };
          }
          if (action === "reset") {
            const left =
              m.kind === "alarm" && m.alarmTime ? nextAlarm(m.alarmTime, at) - at : m.durationMs;
            return { ...m, remainingMs: left, endsAt: at + left, status: "PAUSED" };
          }
          return { ...m, status: "STOPPED", remainingMs: m.durationMs, pinned: false };
        }),
      );
    },
    [ensureAudio],
  );

  const snooze = useCallback(
    (id: string) => {
      void ensureAudio();
      const at = Date.now();
      setMissions((items) =>
        items.map((m) =>
          m.id === id
            ? { ...m, status: "ACTIVE", remainingMs: audio.snoozeMs, endsAt: at + audio.snoozeMs }
            : m,
        ),
      );
    },
    [audio.snoozeMs, ensureAudio],
  );

  const remove = useCallback((id: string) => {
    setMissions((items) => items.filter((m) => m.id !== id));
  }, []);

  const togglePin = useCallback((id: string) => {
    setMissions((items) =>
      items.map((m) => ({ ...m, pinned: m.id === id ? !m.pinned : false })),
    );
  }, []);

  const saveCustomPreset = useCallback(
    (p: { name: string; durationMs: number; description: string }) => {
      setCustomPresets((items) => [...items, { id: crypto.randomUUID(), ...p }]);
    },
    [],
  );

  const toggleAudio = useCallback(async () => {
    const eng = await ensureAudio();
    if (audio.enabled) {
      await eng.mute();
      setAudio((a) => ({ ...a, enabled: false }));
    } else {
      try {
        await eng.unlock();
        eng.chirp(0.7);
      } catch {
        /* audio blocked */
      }
      setAudio((a) => ({ ...a, enabled: true }));
    }
  }, [audio.enabled, ensureAudio]);

  const setAudioVolume = useCallback((which: "ambient" | "crisis", value: number) => {
    setAudio((a) =>
      which === "ambient" ? { ...a, ambientVolume: value } : { ...a, crisisVolume: value },
    );
  }, []);

  const setAudioWindow = useCallback((sec: number) => {
    setAudio((a) => ({ ...a, countdownWindow: sec }));
  }, []);

  const setSnoozeDuration = useCallback((minutes: number) => {
    setAudio((a) => ({ ...a, snoozeMs: minutes * 60000 }));
  }, []);

  const setPhoneAlerts = useCallback((on: boolean) => {
    setAudio((a) => ({ ...a, phoneAlerts: on }));
  }, []);

  const testAlert = useCallback(async () => {
    const eng = await ensureAudio();
    const settings = { ...toSettings(audio), enabled: true };
    [0, 800, 1600].forEach((d, i) =>
      setTimeout(() => eng.tick(3, settings, i), d),
    );
  }, [audio, ensureAudio]);

  return {
    now,
    loaded,
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
    ensureAudio,
  };
}
