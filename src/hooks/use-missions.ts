// src/hooks/use-missions.ts
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
  alarmVolume?: number; // alias
  countdownWindow: number; // seconds
  snoozeMs: number;
  phoneAlerts: boolean;
}

const defaultAudioState: AudioState = {
  enabled: true,
  ambientVolume: defaultAudio.ambient / 100,
  crisisVolume: defaultAudio.alarm / 100,
  alarmVolume: defaultAudio.alarm / 100,
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

  // Gesture unlock on first interaction
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

  // Hydrate state from browser storage
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
      // Ignore corrupted storage
    }
    setNow(Date.now());
    setHydrated(true);
  }, []);

  // Sync to local storage after hydration
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ missions, presets: customPresets, audio }),
      );
    } catch {
      // Storage quota or private mode
    }
  }, [missions, customPresets, audio, hydrated]);

  // Heartbeat loop (drift-free Worker with requestAnimationFrame fallback)
  useEffect(() => {
    let timer: number | null = null;
    const tick = () => {
      const at = Date.now();
      setNow(at);

      setMissions((current) => {
        let changed = false;
        let anyCrisisStarted = false;

        const next = current.map((m) => {
          if (m.status !== "ACTIVE") return m;
          const left = remainingMs(m, at);
          if (left <= 0) {
            changed = true;
            anyCrisisStarted = true;
            return { ...m, status: "CRISIS" as const, remainingMs: 0 };
          }
          return m;
        });

        if (anyCrisisStarted && audio.enabled) {
          void ensureAudio().then((eng) => eng.playAtZero());
        }

        return changed ? next : current;
      });

      // Sound per-second heartbeat
      const s = Math.floor(at / 1000);
      if (s !== beat.current) {
        beat.current = s;
        if (audio.enabled && engine.current) {
          const activeList = missions.filter(
            (m) => m.status === "ACTIVE" || m.status === "CRISIS",
          );
          if (activeList.some((m) => m.status === "CRISIS")) {
            engine.current.tick(3);
          } else if (activeList.length > 0) {
            const minRemaining = Math.min(
              ...activeList.map((m) => remainingMs(m, at)),
            );
            if (minRemaining <= audio.countdownWindow * 1000) {
              engine.current.tick(2);
            } else {
              engine.current.tick(1);
            }
          }
        }
      }
    };

    try {
      const blob = new Blob(
        [
          `let id = setInterval(() => postMessage(0), 250);
           onmessage = (e) => { if (e.data === 'stop') clearInterval(id); };`,
        ],
        { type: "application/javascript" },
      );
      const workerUrl = URL.createObjectURL(blob);
      const worker = new Worker(workerUrl);
      workerRef.current = worker;
      worker.onmessage = tick;
      return () => {
        worker.postMessage("stop");
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
      };
    } catch {
      timer = window.setInterval(tick, 250);
      return () => {
        if (timer !== null) clearInterval(timer);
      };
    }
  }, [audio, missions, ensureAudio]);

  // Operational Commands
  const arm = useCallback(
    (opts: {
      title?: string;
      kind: "timer" | "alarm";
      durationMs: number;
      alarmTime?: string;
      at?: number;
    }) => {
      const at = opts.at ?? Date.now();
      const deadline = at + opts.durationMs;

      void ensureAudio().then((eng) => eng.chirp(1.2));

      const newMission: Mission = {
        id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title:
          opts.title ||
          (opts.kind === "alarm"
            ? `Alarm ${opts.alarmTime || "Set"}`
            : "Operation"),
        kind: opts.kind,
        durationMs: opts.durationMs,
        duration: opts.durationMs,
        startedAt: at,
        deadline,
        endsAt: deadline,
        remainingMs: opts.durationMs,
        remaining: opts.durationMs,
        status: "ACTIVE",
        alarmTime: opts.alarmTime,
      };

      setMissions((prev) => [newMission, ...prev]);
    },
    [ensureAudio],
  );

  const control = useCallback(
    (id: string, action: "START" | "PAUSE" | "RESET" | "STOP") => {
      void ensureAudio().then((eng) => eng.chirp());
      const at = Date.now();

      setMissions((items) =>
        items.map((m) => {
          if (m.id !== id) return m;

          if (action === "PAUSE" && m.status === "ACTIVE") {
            const left = remainingMs(m, at);
            return {
              ...m,
              status: "PAUSED" as const,
              pausedRemaining: left,
              remainingMs: left,
            };
          }

          if (action === "START" && (m.status === "PAUSED" || m.status === "STOPPED")) {
            const left = m.pausedRemaining ?? m.durationMs;
            const deadline = at + left;
            const updated: Mission = {
              ...m,
              status: "ACTIVE" as const,
              deadline,
              endsAt: deadline,
              remainingMs: left,
            };
            delete updated.pausedRemaining;
            return updated;
          }

          if (action === "RESET") {
            const updated: Mission = {
              ...m,
              status: "PAUSED" as const,
              deadline: at + m.durationMs,
              endsAt: at + m.durationMs,
              remainingMs: m.durationMs,
              pausedRemaining: m.durationMs,
            };
            return updated;
          }

          if (action === "STOP") {
            return {
              ...m,
              status: "STOPPED" as const,
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
          const deadline = at + audio.snoozeMs;
          const updated: Mission = {
            ...m,
            status: "ACTIVE" as const,
            deadline,
            endsAt: deadline,
            remainingMs: audio.snoozeMs,
          };
          delete updated.pausedRemaining;
          return updated;
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

  const saveCustomPreset = useCallback((preset: Preset) => {
    setCustomPresets((prev) => [preset, ...prev.filter((p) => p.id !== preset.id)]);
  }, []);

  const setAudioVolume = useCallback((val: number) => {
    setAudio((prev) => ({
      ...prev,
      crisisVolume: val,
      alarmVolume: val,
      ambientVolume: Math.min(prev.ambientVolume, val),
    }));
  }, []);

  const setAudioWindow = useCallback((windowSec: number) => {
    setAudio((prev) => ({ ...prev, countdownWindow: windowSec }));
  }, []);

  const setSnoozeDuration = useCallback((mins: number) => {
    setAudio((prev) => ({ ...prev, snoozeMs: mins * 60000 }));
  }, []);

  const setPhoneAlerts = useCallback((enabled: boolean) => {
    setAudio((prev) => ({ ...prev, phoneAlerts: enabled }));
  }, []);

  const toggleAudio = useCallback(() => {
    setAudio((prev) => {
      const next = !prev.enabled;
      if (!next) {
        engine.current?.stopAtZero();
      }
      return { ...prev, enabled: next };
    });
  }, []);

  const testAlert = useCallback(async () => {
    const eng = await ensureAudio();
    eng.playAtZero();
    setTimeout(() => {
      eng.stopAtZero();
    }, 5000);
  }, [ensureAudio]);

  const presets = [...protocols, ...customPresets];

  return {
    now,
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
    ensureAudio,
  };
}
