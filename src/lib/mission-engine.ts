export type MissionStatus = 'ACTIVE' | 'ARMED' | 'PAUSED' | 'SNOOZED' | 'CRISIS' | 'STOPPED';
export type Mission = { id: string; title: string; kind: 'timer' | 'alarm'; duration: number; remaining: number; deadline: number; status: MissionStatus; time?: string };
export type Preset = { title: string; minutes: number; pinned?: boolean };
export const protocols: Preset[] = [{ title: 'Tactical Sprint', minutes: 25 }, { title: 'Interrogation', minutes: 15 }, { title: 'Satellite Pass', minutes: 45 }, { title: 'Field Stand-Down', minutes: 5 }];
export function remainingMs(m: Mission, now: number) { return ['ACTIVE', 'ARMED', 'SNOOZED', 'CRISIS'].includes(m.status) ? Math.max(0, m.deadline - now) : m.remaining; }
export function nextAlarm(time: string, now: number) {
  const [hours, minutes] = time.split(':').map(Number);
  const d = new Date(now); d.setHours(hours, minutes, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}
export function focusMission(missions: Mission[], pin: string | null, now: number) {
  return missions.find(m => m.id === pin) ?? [...missions].filter(m => ['ACTIVE', 'ARMED', 'SNOOZED', 'CRISIS'].includes(m.status)).sort((a,b) => remainingMs(a,now)-remainingMs(b,now))[0] ?? missions.find(m => m.status === 'PAUSED');
}
export function clockParts(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return [Math.floor(seconds/3600), Math.floor(seconds/60)%60, seconds%60].map(n => String(n).padStart(2,'0')).join(':');
}