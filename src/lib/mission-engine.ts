export type MissionStatus = "ACTIVE" | "PAUSED" | "STOPPED" | "CRISIS";

export interface Mission {
  id: string;
  title: string;
  kind: "timer" | "alarm";
  durationMs?: number;
  duration?: number;
  remainingMs?: number;
  remaining?: number;
  endsAt?: number;
  deadline?: number;
  status: MissionStatus;
  pinned?: boolean;
  alarmTime?: string; // HH:MM:SS or HH:MM
}

export interface Preset {
  id: string;
  name: string;
  durationMs: number;
  description: string;
}

export const protocols: Preset[] = [
  {
    id: "p-sprint",
    name: "Tactical Sprint",
    durationMs: 25 * 60 * 1000,
    description: "25m deep-focus high-tempo sprint",
  },
  {
    id: "p-interrogation",
    name: "Interrogation",
    durationMs: 15 * 60 * 1000,
    description: "15m rapid debriefing or standup",
  },
  {
    id: "p-satellite",
    name: "Satellite Pass",
    durationMs: 45 * 60 * 1000,
    description: "45m orbit monitoring window",
  },
  {
    id: "p-standdown",
    name: "Field Stand-Down",
    durationMs: 5 * 60 * 1000,
    description: "5m tactical breath & reload",
  },
];

export function remainingMs(mission: Mission, now = Date.now()): number {
  if (mission.status === "PAUSED" || mission.status === "STOPPED") {
    return mission.remainingMs ?? mission.remaining ?? 0;
  }
  const target = mission.endsAt ?? mission.deadline ?? now;
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
    if (typeof nowParam === "number") now = nowParam;
  } else if (typeof pinnedIdOrNow === "number") {
    now = pinnedIdOrNow;
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
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
