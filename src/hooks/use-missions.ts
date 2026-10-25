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
  const [hydrated, setHydrated] = useState(false);

  const engine = useRef<CTUAudio | null>(null);
  const beat = useRef(0);
  const workerRef = useRef<Worker | null>(null);

  const ensureAudio = useCallback(async () => {
    if (!engine.current) {
      engine.current = new CTUAudio();
    }
    await engine.current.unlock();
    return engine.current;
  }, []);

  useEffect(() => {
    const handleFirstGesture = () => {
      void ensureAudio();
      window.removeEventListener("pointerdown", handleFirstGesture);
      window.removeEventListener("keydown", handleFirstGesture);
    };
    window.addEventListener("pointerdown", handleFirstGesture, { once: true });
    window.addEventListener("keydown", handleFirstGesture, { once: true });
    return () => {
      window.removeEventListener("pointerdown", handleFirstGesture);
      window.removeEventListener("keydown", handleFirstGesture);
    };
  }, [ensureAudio]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.missions)) {
          setMissions(parsed.missions.filter(isMission));
        }
        if (Array.isArray(parsed.presets)) {
          setCustomPresets(parsed.presets);
        }
        if (parsed.audio && typeof parsed.audio === "object") {
          setAudio((prev) => ({ ...prev, ...parsed.audio }));
        }
      }
    } catch {
      // Ignore corrupted cache
    }
    setNow(Date.now());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ missions, presets: customPresets, audio }),
      );
    } catch {
      // Storage quota exceeded
    }
  }, [missions, customPresets, audio, hydrated]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let fallbackInterval: number | null = null;
    const code = `
      self.onmessage = function(e) {
        if (e.data === 'start') {
          setInterval(function() { self.postMessage('tick'); }, 250);
        }
      };
    `;
    const blob = new Blob([code], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);

    try {
      const w = new Worker(url);
      workerRef.current = w;
      w.onmessage = () => {
        setNow(Date.now());
      };
      w.postMessage("start");
    } catch {
      fallbackInterval = window.setInterval(() => {
        setNow(Date.now());
      }, 250);
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
      }
      URL.revokeObjectURL(url);
    };
  }, []);

  useEffect(() => {
    if (!missions.length || !now) return;

    let changed = false;
    const updated = missions.map((m) => {
      if (m.status !== "ACTIVE") return m;
      const rem = remainingMs(m, now);
      if (rem <= 0) {
        changed = true;
        void ensureAudio().then((eng) => eng.playAtZero(audio.crisisVolume));
        return {
          ...m,
          status: "CRISIS" as const,
          remainingMs: 0,
        };
      }
      return m;
    });

    if (changed) {
      setMissions(updated);
    }
  }, [now, missions, audio.crisisVolume, ensureAudio]);

  useEffect(() => {
    if (!audio.enabled || !now) {
      engine.current?.stopAll();
      return;
    }

    const currentSec = Math.floor(now / 1000);
    if (currentSec === beat.current) return;
    beat.current = currentSec;

    const settings = toSettings(audio);

    if (missions.some((m) => m.status === "CRISIS")) {
      void ensureAudio().then((eng) => eng.tick(3, settings, beat.current));
      return;
    }

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
      void ensureAudio().then((eng) => eng.chirp(0.6));

      const at = Date.now();
      const endsAt = at + opts.durationMs;
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
      void ensureAudio().then((eng) => eng.chirp(0.5));
      const at = Date.now();

      setMissions((items) =>
        items.map((m) => {
          if (m.id !== id) return m;

          if (action === "pause") {
            const rem = remainingMs(m, at);
            return {
              ...m,
              status: "PAUSED",
              remainingMs: rem,
              remaining: rem,
            };
          }

          if (action === "start") {
            const rem = m.remainingMs ?? m.durationMs;
            return {
              ...m,
              status: "ACTIVE",
              endsAt: at + rem,
              remainingMs: rem,
            };
          }

          if (action === "reset") {
            return {
              ...m,
              status: "PAUSED",
              endsAt: at + m.durationMs,
              remainingMs: m.durationMs,
              remaining: m.durationMs,
            };
          }

          if (action === "stop") {
            return {
              ...m,
              status: "STOPPED",
              remainingMs: 0,
            };
          }

          return m;
        }),
      );

      setTimeout(() => {
        setMissions((curr) => {
          if (!curr.some((m) => m.status === "CRISIS")) {
            engine.current?.stopAtZero();
          }
          return curr;
        });
      }, 50);
    },
    [ensureAudio],
  );

  const snooze = useCallback(
    (id: string) => {
      void ensureAudio().then((eng) => {
        eng.chirp(0.8);
        eng.stopAtZero();
      });

      const at = Date.now();
      setMissions((items) =>
        items.map((m) => {
          if (m.id !== id) return m;
          const endsAt = at + audio.snoozeMs;
          return {
            ...m,
            status: "ACTIVE",
            endsAt,
            remainingMs: audio.snoozeMs,
          };
        }),
      );
    },
    [audio.snoozeMs, ensureAudio],
  );

  const remove = useCallback((id: string) => {
    setMissions((items) => {
      const next = items.filter((m) => m.id !== id);
      if (!next.some((m) => m.status === "CRISIS")) {
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
    (name: string, durationMs: number, description?: string) => {
      const preset: Preset = {
        id: `custom-${Date.now()}`,
        name,
        durationMs,
        description: description || "Custom Tactical Preset",
      };
      setCustomPresets((prev) => [...prev, preset]);
    },
    [],
  );

  const setAudioVolume = useCallback((val: number) => {
    setAudio((prev) => ({
      ...prev,
      ambientVolume: val,
      crisisVolume: val,
    }));
  }, []);

  const setAudioWindow = useCallback((seconds: number) => {
    setAudio((prev) => ({ ...prev, countdownWindow: seconds }));
  }, []);

  const setSnoozeDuration = useCallback((minutes: number) => {
    setAudio((prev) => ({ ...prev, snoozeMs: minutes * 60000 }));
  }, []);

  const setPhoneAlerts = useCallback((enabled: boolean) => {
    setAudio((prev) => ({ ...prev, phoneAlerts: enabled }));
  }, []);

  const toggleAudio = useCallback(() => {
    setAudio((prev) => {
      const nextEnabled = !prev.enabled;
      if (!nextEnabled) {
        engine.current?.stopAll();
      } else {
        void ensureAudio();
      }
      return { ...prev, enabled: nextEnabled };
    });
  }, [ensureAudio]);

  const testAlert = useCallback(() => {
    void ensureAudio().then((eng) => {
      eng.playAtZero(audio.crisisVolume);
      setTimeout(() => eng.stopAtZero(), 5000);
    });
  }, [audio.crisisVolume, ensureAudio]);

  const presets = [...protocols, ...customPresets];

  return {
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
  };
}
