import { describe,it,expect } from 'vitest';
import { remainingMs,focusMission,nextAlarm,clockParts,type Mission } from '@/lib/mission-engine';
const mission = (id:string,deadline:number,status:Mission['status']='ACTIVE'):Mission => ({id,title:id,kind:'timer',duration:60000,remaining:30000,deadline,status});
describe('CTU deadline engine',()=>{
  it('uses absolute deadlines and clamps expiration',()=>{expect(remainingMs(mission('a',100000),99000)).toBe(1000);expect(remainingMs(mission('a',100000),120000)).toBe(0);});
  it('freezes paused remaining time',()=>expect(remainingMs(mission('a',100000,'PAUSED'),120000)).toBe(30000));
  it('focuses earliest deadline but honors a manual pin',()=>{const items=[mission('a',90000),mission('b',80000)];expect(focusMission(items,null,1000)?.id).toBe('b');expect(focusMission(items,'a',1000)?.id).toBe('a');});
  it('advances daily alarms to tomorrow after their time passes',()=>{const now=new Date(2026,9,11,15,0).getTime();const target=new Date(nextAlarm('14:00',now));expect(target.getDate()).toBe(12);expect(target.getHours()).toBe(14);});
  it('formats the countdown without dropping a partial second',()=>{expect(clockParts(1499001)).toBe('00:25:00');expect(clockParts(0)).toBe('00:00:00');});
});