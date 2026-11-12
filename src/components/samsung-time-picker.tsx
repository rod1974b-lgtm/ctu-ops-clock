// src/components/samsung-time-picker.tsx — FIXED
// Fix 1 (rules of hooks): the original returned `null` BEFORE useState/useEffect
// when isOpen === false. If the component ever stayed mounted while closed,
// hook order changed and React threw / misbehaved. The early return now happens
// AFTER all hooks, so hook order is identical on every render.
// Fix 2 (double-save): handleSave called BOTH onConfirm and onSave. A parent
// passing both would create the timer/alarm twice. Now it calls onConfirm
// if present, else onSave — exactly once.
import React, { useRef, useState, useCallback, useEffect } from "react";

export type SamsungTimePickerValues = {
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds?: number;
  days?: number[] | undefined;
};

export interface SamsungTimePickerProps {
  mode: "timer" | "alarm";
  isOpen?: boolean;
  initialHours?: number | undefined;
  initialMinutes?: number | undefined;
  initialSeconds?: number | undefined;
  initialDays?: number[] | undefined;
  initialValues?: SamsungTimePickerValues | undefined;
  initialFocus?: "hours" | "minutes" | "seconds" | undefined;
  onSave?: (values: SamsungTimePickerValues) => void;
  onConfirm?: (values: SamsungTimePickerValues) => void;
  onCancel: () => void;
}

interface DrumColumnProps {
  unit: "hours" | "minutes" | "seconds";
  value: number;
  max: number;
  label: string;
  disabled?: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (val: number) => void;
}

function DrumColumn({ unit, value, max, label, disabled = false, isSelected, onSelect, onChange }: DrumColumnProps) {
  const range = max + 1;
  const dragRef = useRef({ y: 0, val: value, dragging: false });
  const [isInlineEditing, setIsInlineEditing] = useState(false);
  const [typedValue, setTypedValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const wrap = useCallback((n: number) => ((n % range) + range) % range, [range]);
  const pad = (n: number) => String(n).padStart(2, "0");
  const vMinus2 = wrap(value - 2);
  const vMinus1 = wrap(value - 1);
  const vPlus1 = wrap(value + 1);
  const vPlus2 = wrap(value + 2);
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || isInlineEditing) return;
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("input")) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    dragRef.current = { y: e.clientY, val: value, dragging: true };
    onSelect();
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !dragRef.current.dragging) return;
    const deltaY = dragRef.current.y - e.clientY;
    const steps = Math.round(deltaY / 28);
    const next = wrap(dragRef.current.val + steps);
    if (next !== value) onChange(next);
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.dragging) return;
    dragRef.current.dragging = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  };
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    onChange(wrap(value + dir));
  };
  const startInlineEdit = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    if (disabled) return;
    onSelect();
    setIsInlineEditing(true);
    setTypedValue(pad(value));
  };
  useEffect(() => {
    if (isInlineEditing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
  }, [isInlineEditing]);
  const commitInlineEdit = () => {
    setIsInlineEditing(false);
    const num = parseInt(typedValue, 10);
    if (!isNaN(num)) onChange(Math.min(max, Math.max(0, num)));
  };
  useEffect(() => {
    if (!isSelected || disabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInlineEditing) return;
      if (e.key === "ArrowUp") { e.preventDefault(); onChange(wrap(value + 1)); }
      else if (e.key === "ArrowDown") { e.preventDefault(); onChange(wrap(value - 1)); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSelected, disabled, isInlineEditing, onChange, wrap, value]);
  return (
    <div className="flex flex-col items-center">
      <button type="button" disabled={disabled} onClick={(e) => { e.stopPropagation(); onSelect(); onChange(wrap(value + 1)); }} className="w-full py-1 text-[#ffcc00]/60 hover:text-[#ffcc00] hover:bg-[#ffcc00]/10 flex items-center justify-center transition border-b border-[#ffcc00]/20 active:scale-95 disabled:opacity-20" title={`Increment ${label} (+1)`}>
        <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20"><path d="M10 5l6 7H4z" /></svg>
      </button>
      <div onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onWheel={handleWheel} onClick={onSelect} className={`w-[96px] h-[190px] bg-[#05050a] border-x flex flex-col items-center justify-center relative overflow-hidden transition-all touch-none ${isSelected ? "border-x-[#ffcc00] shadow-[inset_0_0_20px_rgba(255,204,0,0.2)]" : "border-x-neutral-800 opacity-80"} ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-grab active:cursor-grabbing"}`}>
        <div className="absolute top-0 inset-x-0 h-10 bg-gradient-to-b from-black via-black/80 to-transparent pointer-events-none z-10" />
        <div className="absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none z-10" />
        <div onClick={(e) => { e.stopPropagation(); onChange(vMinus2); }} className="h-[32px] flex items-center justify-center text-[18px] text-[#ffcc00]/20 font-mono font-bold select-none cursor-pointer hover:text-[#ffcc00]/40">{pad(vMinus2)}</div>
        <div onClick={(e) => { e.stopPropagation(); onChange(vMinus1); }} className="h-[36px] flex items-center justify-center text-[22px] text-[#ffcc00]/50 font-mono font-bold select-none cursor-pointer hover:text-[#ffcc00]/70">{pad(vMinus1)}</div>
        <div className="h-[48px] w-full flex items-center justify-center relative z-20 my-0.5">
          <div className="absolute inset-x-1 inset-y-0.5 border-y-2 border-[#ffcc00] bg-[#ffcc00]/15 pointer-events-none shadow-[0_0_12px_rgba(255,204,0,0.25)]" />
          {isInlineEditing ? (
            <input ref={inputRef} type="text" inputMode="numeric" maxLength={2} value={typedValue} onChange={(e) => setTypedValue(e.target.value.replace(/\D/g, ""))} onBlur={commitInlineEdit} onKeyDown={(e) => { if (e.key === "Enter") commitInlineEdit(); if (e.key === "Escape") setIsInlineEditing(false); }} className="w-16 h-10 bg-black text-[#ffcc00] text-[32px] font-black font-mono text-center outline-none border border-[#ffcc00] shadow-[0_0_15px_rgba(255,204,0,0.5)] z-30" />
          ) : (
            <button type="button" onClick={startInlineEdit} title="Tap to type directly" className="text-[34px] font-black font-mono text-[#ffcc00] drop-shadow-[0_0_10px_rgba(255,204,0,0.8)] tracking-tight hover:scale-105 active:scale-95 transition-transform cursor-pointer px-3 py-1">{pad(value)}</button>
          )}
        </div>
        <div onClick={(e) => { e.stopPropagation(); onChange(vPlus1); }} className="h-[36px] flex items-center justify-center text-[22px] text-[#ffcc00]/50 font-mono font-bold select-none cursor-pointer hover:text-[#ffcc00]/70">{pad(vPlus1)}</div>
        <div onClick={(e) => { e.stopPropagation(); onChange(vPlus2); }} className="h-[32px] flex items-center justify-center text-[18px] text-[#ffcc00]/20 font-mono font-bold select-none cursor-pointer hover:text-[#ffcc00]/40">{pad(vPlus2)}</div>
      </div>
      <button type="button" disabled={disabled} onClick={(e) => { e.stopPropagation(); onSelect(); onChange(wrap(value - 1)); }} className="w-full py-1 text-[#ffcc00]/60 hover:text-[#ffcc00] hover:bg-[#ffcc00]/10 flex items-center justify-center transition border-t border-[#ffcc00]/20 active:scale-95 disabled:opacity-20" title={`Decrement ${label} (-1)`}>
        <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20"><path d="M10 15l-6-7h12z" /></svg>
      </button>
      <span className={`mt-1.5 text-[11px] font-bold tracking-widest ${isSelected ? "text-[#ffcc00]" : "text-neutral-500"}`}>{label}</span>
    </div>
  );
}

const WEEK_DAYS = [
  { day: 0, label: "S", full: "Sun" },
  { day: 1, label: "M", full: "Mon" },
  { day: 2, label: "T", full: "Tue" },
  { day: 3, label: "W", full: "Wed" },
  { day: 4, label: "T", full: "Thu" },
  { day: 5, label: "F", full: "Fri" },
  { day: 6, label: "S", full: "Sat" },
];

export function SamsungTimePicker({
  mode, isOpen = true, initialHours = 0, initialMinutes = 0, initialSeconds = 0,
  initialDays = [0, 1, 2, 3, 4, 5, 6], initialValues, initialFocus = "minutes", onSave, onConfirm, onCancel,
}: SamsungTimePickerProps) {
  // ALL hooks run BEFORE any early return — hook order is now stable.
  const effectiveHours = initialValues?.hours ?? initialHours;
  const effectiveMinutes = initialValues?.minutes ?? initialMinutes;
  const effectiveSeconds = initialValues?.seconds ?? initialSeconds;
  const effectiveDays = initialValues?.days ?? initialDays;
  const [hours, setHours] = useState(effectiveHours);
  const [minutes, setMinutes] = useState(effectiveMinutes);
  const [seconds, setSeconds] = useState(mode === "alarm" ? 0 : effectiveSeconds);
  const [activeUnit, setActiveUnit] = useState<"hours" | "minutes" | "seconds">(initialFocus);
  const [selectedDays, setSelectedDays] = useState<number[]>(effectiveDays);
  useEffect(() => {
    setHours(effectiveHours);
    setMinutes(effectiveMinutes);
    setSeconds(mode === "alarm" ? 0 : effectiveSeconds);
    setSelectedDays(effectiveDays);
  }, [effectiveHours, effectiveMinutes, effectiveSeconds, effectiveDays, mode]);

  // Early return AFTER hooks — safe now.
  if (isOpen === false) return null;

  const toggleDay = (day: number) => {
    setSelectedDays((prev) => {
      if (prev.includes(day)) {
        if (prev.length === 1) return prev;
        return prev.filter((d) => d !== day);
      }
      return [...prev, day].sort((a, b) => a - b);
    });
  };
  const handleSave = () => {
    const totalSec = hours * 3600 + minutes * 60 + seconds;
    const result: SamsungTimePickerValues = {
      hours, minutes, seconds, totalSeconds: totalSec,
      days: mode === "alarm" ? selectedDays : undefined,
    };
    // FIX: exactly one callback — onConfirm wins, else onSave. Never both.
    if (onConfirm) onConfirm(result);
    else if (onSave) onSave(result);
  };
  const getDaysSummary = () => {
    if (selectedDays.length === 7) return "EVERY DAY";
    if (selectedDays.length === 5 && [1, 2, 3, 4, 5].every((d) => selectedDays.includes(d))) return "WEEKDAYS (MON–FRI)";
    if (selectedDays.length === 2 && selectedDays.includes(0) && selectedDays.includes(6)) return "WEEKENDS (SAT–SUN)";
    return selectedDays.map((d) => WEEK_DAYS.find((w) => w.day === d)?.full.toUpperCase()).join(", ");
  };
  return (
    <div onClick={onCancel} className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div onClick={(e) => e.stopPropagation()} className="border-2 border-[#ffcc00] rounded-[24px] bg-[#0a0a14] p-4 md:p-5 w-full max-w-[390px] shadow-[0_0_45px_rgba(255,204,0,0.35)] select-none my-auto">
        <div className="text-center text-[15px] tracking-[0.25em] font-black text-[#ffcc00] flex items-center justify-center gap-2">
          <span>{mode === "alarm" ? "ALARM TIME & WEEKLY DAYS" : "OPERATION TIMER SETTER"}</span>
        </div>
        <div className="text-center text-[9px] tracking-[0.22em] text-[#ffcc00]/70 mt-1">TAP ANY DIGIT TO EDIT • USE ARROWS TO STEP</div>
        <div className="mt-4 flex justify-center gap-2.5">
          <DrumColumn unit="hours" value={hours} max={mode === "alarm" ? 23 : 99} label="HOURS" isSelected={activeUnit === "hours"} onSelect={() => setActiveUnit("hours")} onChange={setHours} />
          <DrumColumn unit="minutes" value={minutes} max={59} label="MINS" isSelected={activeUnit === "minutes"} onSelect={() => setActiveUnit("minutes")} onChange={setMinutes} />
          {mode === "timer" && (
            <DrumColumn unit="seconds" value={seconds} max={59} label="SECS" isSelected={activeUnit === "seconds"} onSelect={() => setActiveUnit("seconds")} onChange={setSeconds} />
          )}
        </div>
        {mode === "alarm" && (
          <div className="mt-5 border-t border-[#ffcc00]/25 pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] tracking-widest text-[#ffcc00]/80 font-bold uppercase">REPEATING DAYS:</span>
              <span className="text-[10px] tracking-wider text-[#ffcc00] font-black">{getDaysSummary()}</span>
            </div>
            <div className="flex justify-between items-center gap-1.5 mt-2">
              {WEEK_DAYS.map((w) => {
                const active = selectedDays.includes(w.day);
                return (
                  <button key={w.day} type="button" onClick={() => toggleDay(w.day)} className={`flex-1 h-9 rounded-full text-xs font-black transition flex items-center justify-center border ${active ? "bg-[#ffcc00] text-black border-[#ffcc00] shadow-[0_0_12px_rgba(255,204,0,0.5)] scale-105" : "bg-black/60 text-[#ffcc00]/40 border-[#ffcc00]/20 hover:border-[#ffcc00]/60 hover:text-[#ffcc00]"}`}>{w.label}</button>
                );
              })}
            </div>
            <div className="flex justify-center gap-2 mt-3 text-[9px] font-bold">
              <button type="button" onClick={() => setSelectedDays([0, 1, 2, 3, 4, 5, 6])} className="px-2 py-0.5 border border-[#ffcc00]/30 text-[#ffcc00]/80 hover:bg-[#ffcc00]/15">ALL</button>
              <button type="button" onClick={() => setSelectedDays([1, 2, 3, 4, 5])} className="px-2 py-0.5 border border-[#ffcc00]/30 text-[#ffcc00]/80 hover:bg-[#ffcc00]/15">MON–FRI</button>
              <button type="button" onClick={() => setSelectedDays([0, 6])} className="px-2 py-0.5 border border-[#ffcc00]/30 text-[#ffcc00]/80 hover:bg-[#ffcc00]/15">SAT–SUN</button>
            </div>
          </div>
        )}
        <div className="mt-5 pt-3 border-t border-[#ffcc00]/30 flex gap-3">
          <button type="button" onClick={onCancel} className="flex-1 py-2.5 border border-[#ffcc00]/50 text-[#ffcc00]/80 hover:bg-[#ffcc00]/10 font-bold tracking-widest text-xs rounded transition">CANCEL</button>
          <button type="button" onClick={handleSave} className="flex-1 py-2.5 bg-[#ffcc00] text-black hover:bg-[#ffe066] font-black tracking-widest text-xs rounded shadow-[0_0_20px_rgba(255,204,0,0.4)] transition">CONFIRM</button>
        </div>
      </div>
    </div>
  );
}
