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
  pausedRemaining?: number | undefined;
  remaining?: number;
  remainingMs?: number;
  status: MissionStatus;
  pinned?: boolean;
  alarmTime?: string;
  days?: number[]; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  startedAt?: number;
}

export interface Preset {
  id: string;
  title?: string;
  name?: string;
  kind?: "timer" | "alarm";
  durationMs: number;
  alarmTime?: string;
  days?: number[];
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

/**
 * Calculates the exact millisecond epoch for the next alarm trigger.
 * Supports weekly recurring days (0 = Sun, 1 = Mon, 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri, 6 = Sat).
 * Defaults to daily recurrence if no days are specified.
 */
export function nextAlarm(alarmTime: string, now = Date.now(), days?: number[]): number {
  const parts = alarmTime.split(":").map(Number);
  const hours = parts[0] ?? 0;
  const minutes = parts[1] ?? 0;
  const seconds = parts[2] ?? 0;

  const activeDays = (days && days.length > 0) ? days : [0, 1, 2, 3, 4, 5, 6];

  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + offset);
    candidate.setHours(hours, minutes, seconds, 0);

    const dayOfWeek = candidate.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    if (activeDays.includes(dayOfWeek) && candidate.getTime() > now) {
      return candidate.getTime();
    }
  }

  // Fallback: 24 hours later
  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 1);
  fallback.setHours(hours, minutes, seconds, 0);
  return fallback.getTime();
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
  if (active.length) return active[0] ?? null;

  const paused = missions
    .filter((m) => m.status === "PAUSED")
    .sort((a, b) => remainingMs(a, now) - remainingMs(b, now));
  if (paused.length) return paused[0] ?? null;

  return missions[0] ?? null;
}

export function clockParts(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
