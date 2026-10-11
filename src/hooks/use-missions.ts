import { useEffect, useState } from 'react';
import { type Mission, type Preset, focusMission, remainingMs, nextAlarm } from '@/lib/mission-engine';

export function useMissions() {
  const [now, setNow] = useState(0);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [pin, setPin] = useState<string | null>(null);
  const [customPresets, setCustomPresets] = useState<Preset[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setNow(Date.now());
    try { const saved = JSON.parse(localStorage.getItem('ctu-missions-v1') ?? 'null'); if (saved) { setMissions(saved.missions ?? []); setPin(saved.pin ?? null); setCustomPresets(saved.presets ?? []); } } catch { /* corrupted storage starts a fresh terminal */ }
    setLoaded(true);
    let worker: Worker | undefined;
    let url: string | undefined;
    let fallback: ReturnType<typeof setInterval> | undefined;
    const tick = () => setNow(Date.now());
    try {
      url = URL.createObjectURL(new Blob(['setInterval(() => postMessage(Date.now()), 250);'], { type: 'text/javascript' }));
      worker = new Worker(url); worker.onmessage = tick;
      worker.onerror = () => { worker?.terminate(); if (!fallback) fallback = setInterval(tick, 250); };
    } catch { fallback = setInterval(tick,250); }
    const visible = () => { tick(); }; document.addEventListener('visibilitychange',visible); window.addEventListener('focus', tick);
    return () => { worker?.terminate(); if (url) URL.revokeObjectURL(url); if (fallback) clearInterval(fallback); document.removeEventListener('visibilitychange',visible); window.removeEventListener('focus',tick); };
  },[]);
  useEffect(() => { if (loaded) try { localStorage.setItem('ctu-missions-v1', JSON.stringify({missions,pin,presets:customPresets})); } catch { /* storage may be unavailable */ } },[missions,pin,customPresets,loaded]);
  useEffect(() => { if (!now) return; setMissions(current => current.some(m => ['ACTIVE','ARMED','SNOOZED'].includes(m.status) && m.deadline <= now) ? current.map(m => ['ACTIVE','ARMED','SNOOZED'].includes(m.status) && m.deadline <= now ? {...m,status:'CRISIS',remaining:0} : m) : current); },[now]);
  const arm = (title: string, duration: number, kind: 'timer' | 'alarm' = 'timer', time?: string, pinned = false) => {
    const at = Date.now(); const id = crypto.randomUUID(); const deadline = kind === 'alarm' && time ? nextAlarm(time,at) : at+duration;
    setMissions(items => [...items,{id,title,kind,time,duration,remaining:deadline-at,deadline,status:kind==='alarm'?'ARMED':'ACTIVE'}]);
    if (pinned) setPin(id); return id;
  };
  const act = (id: string, action: 'pause' | 'start' | 'reset' | 'stop' | 'snooze', snoozeMinutes = 5) => {
    const at = Date.now();
    setMissions(items => items.map(m => {
      if (m.id !== id) return m;
      if (action === 'pause') return {...m, remaining:remainingMs(m,at),status:'PAUSED'};
      if (action === 'start') return {...m,deadline:m.kind === 'alarm' && m.time && m.status !== 'PAUSED' ? nextAlarm(m.time,at) : at+(m.remaining || m.duration),status:m.kind==='alarm'?'ARMED':'ACTIVE'};
      if (action === 'reset') { const duration = m.kind === 'alarm' && m.time ? nextAlarm(m.time,at)-at : m.duration; return {...m,remaining:duration,deadline:at+duration,status:'PAUSED'}; }
      if (action === 'snooze') return {...m,remaining:snoozeMinutes*60000,deadline:at+snoozeMinutes*60000,status:'SNOOZED'};
      return {...m,status:'STOPPED',remaining:m.duration};
    }));
    if (action === 'stop') setPin(p => p===id ? null : p);
  };
  const remove = (id: string) => { setMissions(items => items.filter(m => m.id!==id)); setPin(p => p===id?null:p); };
  return {now,missions,pin,setPin,customPresets,setCustomPresets,arm,act,remove,focus:focusMission(missions,pin,now),loaded};
}