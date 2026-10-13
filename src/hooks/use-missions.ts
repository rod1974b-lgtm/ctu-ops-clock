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
  enabled: false,
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
    countdown: Math.max(30, Math.round(a.crisisVolume * 70)),
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

  // Load + start drift-free ticker (browser only)
  useEffect(() => {
    setNow(Date.now());
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (saved) {
        if (Array.isArray(saved.missions)) setMissions(saved.missions.filter(isMission));
        if (Array.isArray(saved.presets)) setCustomPresets(saved.presets);
        if (saved.audio) setAudio({ ...defaultAudioState, ...saved.audio, enabled: false });
      }
    } catch {
      /* corrupted storage starts a fresh terminal */
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
      /* storage may be unavailable */
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

  // Audio tiers, once per second
  useEffect(() => {
    if (!now || !audio.enabled || !engine.current) return;
    const sec = Math.floor(now / 1000);
    if (sec === lastSecond.current) return;
    lastSecond.current = sec;
    beat.current += 1;
    const settings = toSettings(audio);
    if (missions.some((m) => m.status === "CRISIS")) {
      if (beat.current % 2 === 0) engine.current.tick(3, settings, beat.current);
      return;
    }
    const active = missions.filter((m) => m.status === "ACTIVE");
    if (!active.length) return;
    const closest = Math.min(...active.map((m) => remainingMs(m, now)));
    engine.current.tick(closest <= audio.countdownWindow * 1000 ? 2 : 1, settings, beat.current);
  }, [now, audio, missions]);

  const arm = useCallback(
    (opts: { title: string; kind: "timer" | "alarm"; durationMs: number; alarmTime?: string }) => {
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
    [],
  );

  const control = useCallback((id: string, action: "start" | "pause" | "reset" | "stop") => {
    const at = Date.now();
    setMissions((items) =>
      items.map((m) => {
        if (m.id !== id) return m;
        if (action === "pause")
          return { ...m, remainingMs: remainingMs(m, at), status: "PAUSED" };
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
  }, []);

  const snooze = useCallback(
    (id: string) => {
      const at = Date.now();
      setMissions((items) =>
        items.map((m) =>
          m.id === id
            ? { ...m, status: "ACTIVE", remainingMs: audio.snoozeMs, endsAt: at + audio.snoozeMs }
            : m,
        ),
      );
    },
    [audio.snoozeMs],
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
    if (!engine.current) engine.current = new CTUAudio();
    if (audio.enabled) {
      await engine.current.mute();
      setAudio((a) => ({ ...a, enabled: false }));
    } else {
      try {
        await engine.current.unlock();
        engine.current.chirp(0.6);
      } catch {
        /* audio unavailable */
      }
      setAudio((a) => ({ ...a, enabled: true }));
    }
  }, [audio.enabled]);

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
    if (!engine.current) engine.current = new CTUAudio();
    try {
      await engine.current.unlock();
    } catch {
      return;
    }
    const settings = { ...toSettings(audio), enabled: true };
    [0, 1000, 2000].forEach((d, i) =>
      setTimeout(() => engine.current?.tick(3, settings, i), d),
    );
  }, [audio]);

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
  };
}
