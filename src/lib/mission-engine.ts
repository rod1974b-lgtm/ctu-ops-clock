// src/lib/mission-engine.ts
export type MissionStatus = "ACTIVE" | "PAUSED" | "CRISIS" | "STOPPED";

export interface Mission {
  id: string;
  title: string;
  kind: "timer" | "alarm";
  durationMs: number;
  duration?: number;
  deadline: number;
  endsAt?: number;
  pausedRemaining?: number;
  remaining?: number;
  remainingMs?: number;
  status: MissionStatus;
  pinned?: boolean;
  alarmTime?: string;
  startedAt?: number;
}

export interface Preset {
  id: string;
  title?: string;
  name?: string;
  kind?: "timer" | "alarm";
  durationMs: number;
  alarmTime?: string;
  description?: string;
}

export const PROTOCOLS: Preset[] = [
  {
    id: "tactical-sprint",
    title: "Tactical Sprint",
    kind: "timer",
    durationMs: 25 * 60 * 1000,
  },
  {
    id: "interrogation",
    title: "Interrogation Window",
    kind: "timer",
    durationMs: 15 * 60 * 1000,
  },
  {
    id: "satellite-pass",
    title: "Satellite Pass",
    kind: "timer",
    durationMs: 45 * 60 * 1000,
  },
  {
    id: "field-stand-down",
    title: "Field Stand-Down",
    kind: "timer",
    durationMs: 5 * 60 * 1000,
  },
];

export const protocols = PROTOCOLS;

export function remainingMs(mission: Mission, now = Date.now()): number {
  if (mission.status === "PAUSED") {
    return Math.max(
      0,
      mission.pausedRemaining ??
        mission.remaining ??
        mission.remainingMs ??
        0,
    );
  }
  const target = mission.deadline ?? mission.endsAt ?? now;
  return Math.max(0, target - now);
}

export function nextAlarm(alarmTime: string, now = Date.now()): number {
  const parts = alarmTime.split(":").map(Number);
  const hours = parts[0] ?? 0;
  const minutes = parts[1] ?? 0;
  const seconds = parts[2] ?? 0;

  const target = new Date(now);
  target.setHours(hours, minutes, seconds, 0);

  if (target.getTime() <= now) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime();
}

export function focusMission(
  missions: Mission[],
  pinnedIdOrNow?: string | number | null,
  nowParam?: number,
): Mission | null {
  if (!missions.length) return null;

  let pinnedId: string | null = null;
  let now = Date.now();

  if (typeof pinnedIdOrNow === "string") {
    pinnedId = pinnedIdOrNow;
  } else if (typeof pinnedIdOrNow === "number") {
    now = pinnedIdOrNow;
  }
  if (typeof nowParam === "number") {
    now = nowParam;
  }

  if (pinnedId) {
    const explicitlyPinned = missions.find((m) => m.id === pinnedId);
    if (explicitlyPinned) return explicitlyPinned;
  }

  const pinned = missions.find((m) => m.pinned);
  if (pinned) return pinned;

  const active = missions
    .filter((m) => m.status === "ACTIVE" || m.status === "CRISIS")
    .sort((a, b) => remainingMs(a, now) - remainingMs(b, now));
  if (active.length) return active[0];

  const paused = missions
    .filter((m) => m.status === "PAUSED")
    .sort((a, b) => remainingMs(a, now) - remainingMs(b, now));
  if (paused.length) return paused[0];

  return missions[0];
}

export function clockParts(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
