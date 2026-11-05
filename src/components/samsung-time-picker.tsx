// src/components/samsung-time-picker.tsx
import React, { useRef, useState, useCallback } from "react";

export type SamsungTimePickerValues = {
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
};

export interface SamsungTimePickerProps {
  mode: "timer" | "alarm";
  initialHours?: number;
  initialMinutes?: number;
  initialSeconds?: number;
  onSave: (values: SamsungTimePickerValues) => void;
  onCancel: () => void;
}

interface DrumColumnProps {
  value: number;
  max: number;
  label: string;
  disabled?: boolean;
  onChange: (val: number) => void;
}

function DrumColumn({ value, max, label, disabled = false, onChange }: DrumColumnProps) {
  const range = max + 1;
  const dragRef = useRef({ y: 0, val: 0, dragging: false });

  const wrap = (n: number) => ((n % range) + range) % range;
  const pad = (n: number) => String(n).padStart(2, "0");

  const vMinus2 = wrap(value - 2);
  const vMinus1 = wrap(value - 1);
  const vPlus1 = wrap(value + 1);
  const vPlus2 = wrap(value + 2);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    dragRef.current = { y: e.clientY, val: value, dragging: true };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !dragRef.current.dragging) return;
    const deltaY = dragRef.current.y - e.clientY;
    const steps = Math.round(deltaY / 32);
    const next = wrap(dragRef.current.val + steps);
    if (next !== value) onChange(next);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.dragging) return;
    dragRef.current.dragging = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    onChange(wrap(value + dir));
  };

  return (
    <div
      className={`relative flex flex-col items-center select-none ${
        disabled ? "opacity-20 pointer-events-none" : ""
      }`}
    >
      {/* Top Stepper */}
      <button
        type="button"
        onClick={() => !disabled && onChange(wrap(value + 1))}
        className="w-[92px] h-[32px] rounded-t-[10px] bg-black border border-b-0 border-[#ffcc00]/30 text-[#ffcc00]/70 hover:text-[#ffcc00] hover:bg-[#1a1a00] text-[12px] tracking-widest font-bold active:scale-[0.97] transition-colors"
      >
        ▲ {pad(vPlus1)}
      </button>

      {/* Drum Body */}
      <div
        className="relative w-[92px] h-[200px] bg-[#151525] border-x-2 border-[#ffcc00]/70 overflow-hidden touch-none cursor-grab active:cursor-grabbing"
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      >
        {/* Top & Bottom Ambient Vignette Fade */}
        <div className="absolute inset-x-0 top-0 h-[64px] bg-gradient-to-b from-black via-black/80 to-transparent pointer-events-none z-20" />
        <div className="absolute inset-x-0 bottom-0 h-[64px] bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none z-20" />

        {/* Center Glowing Target Pill */}
        <div className="absolute left-2 right-2 top-1/2 -translate-y-1/2 h-[52px] bg-[#ffcc00]/[0.11] border-y border-[#ffcc00]/40 rounded-[10px] z-10 pointer-events-none shadow-[inset_0_0_14px_rgba(255,204,0,0.15)]" />

        {/* Digit Stack */}
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
          <div className="text-[12px] font-bold tracking-[0.18em] text-white/15">{pad(vMinus2)}</div>
          <div className="text-[15px] font-bold tracking-[0.18em] text-white/35 mt-3">{pad(vMinus1)}</div>
          <div className="my-[10px] text-[36px] font-black tracking-[0.18em] text-white drop-shadow-[0_0_14px_rgba(255,204,0,0.7)] leading-none">
            {pad(value)}
          </div>
          <div className="text-[15px] font-bold tracking-[0.18em] text-white/35">{pad(vPlus1)}</div>
          <div className="text-[12px] font-bold tracking-[0.18em] text-white/15 mt-3">{pad(vPlus2)}</div>
        </div>

        {/* Column Label */}
        <div className="absolute bottom-[6px] left-0 right-0 text-center text-[9px] tracking-[0.22em] text-[#ffcc00]/50 font-bold z-20 pointer-events-none">
          {label}
        </div>
      </div>

      {/* Bottom Stepper */}
      <button
        type="button"
        onClick={() => !disabled && onChange(wrap(value - 1))}
        className="w-[92px] h-[32px] rounded-b-[10px] bg-black border border-t-0 border-[#ffcc00]/30 text-[#ffcc00]/70 hover:text-[#ffcc00] hover:bg-[#1a1a00] text-[12px] tracking-widest font-bold active:scale-[0.97] transition-colors"
      >
        ▼ {pad(vMinus1)}
      </button>
    </div>
  );
}

export function SamsungTimePicker({
  mode,
  initialHours = 0,
  initialMinutes = 5,
  initialSeconds = 0,
  onSave,
  onCancel,
}: SamsungTimePickerProps) {
  const [hours, setHours] = useState<number>(initialHours);
  const [minutes, setMinutes] = useState<number>(initialMinutes);
  const [seconds, setSeconds] = useState<number>(initialSeconds);

  const pad = (n: number) => String(n).padStart(2, "0");

  const handleConfirm = useCallback(() => {
    const total = hours * 3600 + minutes * 60 + (mode === "alarm" ? 0 : seconds);
    onSave({
      hours,
      minutes,
      seconds: mode === "alarm" ? 0 : seconds,
      totalSeconds: total,
    });
  }, [hours, minutes, seconds, mode, onSave]);

  return (
    <div className="border-2 border-[#ffcc00] rounded-[24px] bg-[#0a0a14] p-5 w-full max-w-[380px] shadow-[0_0_40px_rgba(255,204,0,0.28)]">
      {/* Header */}
      <div className="text-center text-[14px] tracking-[0.25em] font-bold text-[#ffcc00]">
        {mode === "alarm" ? "ALARM • SLIDE WHEEL" : "TIMER • SLIDE WHEEL"}
      </div>
      <div className="text-center text-[9px] tracking-[0.22em] opacity-40 mt-1 text-[#ffcc00]">
        DRAG UP/DOWN • 32px = 1 STEP • WRAPS • SILENT
      </div>

      {/* Drums Row */}
      <div className="mt-4 flex justify-center gap-3">
        <DrumColumn
          value={hours}
          max={mode === "alarm" ? 23 : 99}
          label="HOUR"
          onChange={setHours}
        />
        <DrumColumn
          value={minutes}
          max={59}
          label="MIN"
          onChange={setMinutes}
        />
        <DrumColumn
          value={seconds}
          max={59}
          label="SEC"
          disabled={mode === "alarm"}
          onChange={setSeconds}
        />
      </div>

      {/* Pill Display */}
      <div className="mt-5 flex justify-center">
        <div className="inline-flex items-center gap-3 px-5 py-2.5 bg-black border border-[#ffcc00]/30 rounded-full shadow-[0_0_18px_rgba(255,204,0,0.15)]">
          <span className="text-[24px] font-black tracking-[0.2em] text-white">
            {pad(hours)}:{pad(minutes)}:{mode === "alarm" ? "--" : pad(seconds)}
          </span>
          <span className="text-[9px] tracking-[0.2em] opacity-50 text-[#ffcc00]">
            {mode === "alarm" ? "24HR" : "HH:MM:SS"}
          </span>
        </div>
      </div>

      <div className="mt-2 text-center text-[9px] opacity-30 tracking-widest">
        SLIDE SET • SILENT
      </div>

      {/* Modal Actions */}
      <div className="grid grid-cols-2 gap-3 mt-5">
        <button
          type="button"
          onClick={handleConfirm}
          className="bg-[#ffcc00] text-black font-black text-[14px] tracking-widest min-h-[44px] rounded-[8px] hover:bg-[#ffcc00]/80 transition-colors"
        >
          SET
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="bg-black border border-[#ffcc00] text-[#ffcc00] font-black text-[14px] tracking-widest min-h-[44px] rounded-[8px] hover:bg-[#1a1a00] transition-colors"
        >
          CANCEL
        </button>
      </div>
    </div>
  );
}
