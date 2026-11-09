// src/components/samsung-time-picker.tsx
import React, { useRef, useState, useCallback, useEffect } from "react";

export type SamsungTimePickerValues = {
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
  days?: number[]; // 0 = Sun, 1 = Mon, ..., 6 = Sat
};

export interface SamsungTimePickerProps {
  mode: "timer" | "alarm";
  initialHours?: number;
  initialMinutes?: number;
  initialSeconds?: number;
  initialDays?: number[];
  initialFocus?: "hours" | "minutes" | "seconds";
  onSave: (values: SamsungTimePickerValues) => void;
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

function DrumColumn({
  unit,
  value,
  max,
  label,
  disabled = false,
  isSelected,
  onSelect,
  onChange,
}: DrumColumnProps) {
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
    if (target.closest("button") || target.closest("input")) {
      return;
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
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

  const startInlineEdit = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    if (disabled) return;
    onSelect();
    setIsInlineEditing(true);
    setTypedValue(pad(value));
  };

  useEffect(() => {
    if (isInlineEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isInlineEditing]);

  const commitInlineEdit = () => {
    setIsInlineEditing(false);
    const num = parseInt(typedValue, 10);
    if (!isNaN(num)) {
      onChange(Math.min(max, Math.max(0, num)));
    }
  };

  useEffect(() => {
    if (!isSelected || disabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInlineEditing) return;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        onChange(wrap(value + 1));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        onChange(wrap(value - 1));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSelected, disabled, value, wrap, onChange, isInlineEditing]);

  return (
    <div
      className={`relative flex flex-col items-center select-none ${disabled ? "opacity-30 pointer-events-none" : ""}`}
    >
      {/* Top Stepper Button */}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
          if (!disabled) onChange(wrap(value + 1));
        }}
        className={`w-[96px] h-[34px] rounded-t-[10px] bg-black border border-b-0 text-[12px] tracking-widest font-bold active:scale-[0.96] transition-all flex items-center justify-center gap-1 cursor-pointer z-30 ${
          isSelected
            ? "border-[#ffcc00] text-[#ffcc00] bg-[#1a1a00] shadow-[0_0_12px_rgba(255,204,0,0.3)]"
            : "border-[#ffcc00]/30 text-[#ffcc00]/70 hover:text-[#ffcc00] hover:border-[#ffcc00]"
        }`}
      >
        ▲ <span className="opacity-80 font-mono">{pad(vPlus1)}</span>
      </button>

      {/* Drum Cylinder Viewport */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        className={`w-[96px] h-[190px] bg-[#05050a] border-x flex flex-col items-center justify-center relative overflow-hidden transition-all touch-none ${
          isSelected
            ? "border-x-[#ffcc00] shadow-[inset_0_0_20px_rgba(255,204,0,0.2)]"
            : "border-x-[#ffcc00]/30"
        }`}
      >
        {/* Curved Drum Ambient Vignettes */}
        <div className="absolute top-0 left-0 right-0 h-10 bg-gradient-to-b from-black via-black/80 to-transparent pointer-events-none z-10" />
        <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none z-10" />

        {/* Center Target Lens */}
        <div className="absolute inset-x-1 top-[70px] h-[50px] border-y-2 border-[#ffcc00] bg-[#ffcc00]/10 pointer-events-none z-10 shadow-[0_0_15px_rgba(255,204,0,0.25)]" />

        {/* Outer Top +2 */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
            onChange(vPlus2);
          }}
          className="text-[13px] font-mono text-[#ffcc00]/25 select-none h-6 flex items-center cursor-pointer hover:text-[#ffcc00]/60 transition"
        >
          {pad(vPlus2)}
        </div>

        {/* Inner Top +1 */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
            onChange(vPlus1);
          }}
          className="text-[18px] font-mono text-[#ffcc00]/50 select-none h-7 flex items-center cursor-pointer hover:text-[#ffcc00]/80 transition"
        >
          {pad(vPlus1)}
        </div>

        {/* Center Active Value */}
        <div className="h-[52px] flex items-center justify-center z-20 my-0.5">
          {isInlineEditing ? (
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={typedValue}
              onChange={(e) => {
                const clean = e.target.value.replace(/\D/g, "").slice(0, 2);
                setTypedValue(clean);
              }}
              onBlur={commitInlineEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitInlineEdit();
                if (e.key === "Escape") setIsInlineEditing(false);
              }}
              className="w-16 h-10 bg-black text-[#ffcc00] border-2 border-[#ffcc00] rounded text-center text-[28px] font-black font-mono tracking-wider focus:outline-none shadow-[0_0_15px_rgba(255,204,0,0.6)]"
            />
          ) : (
            <button
              type="button"
              onClick={startInlineEdit}
              className="text-[34px] font-black font-mono text-[#ffcc00] tracking-wider select-none hover:scale-105 active:scale-95 transition-transform flex items-center justify-center cursor-pointer px-2 py-0.5 rounded bg-black/40 hover:bg-[#ffcc00]/20"
              title="Tap to type directly"
            >
              {pad(value)}
            </button>
          )}
        </div>

        {/* Inner Bottom -1 */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
            onChange(vMinus1);
          }}
          className="text-[18px] font-mono text-[#ffcc00]/50 select-none h-7 flex items-center cursor-pointer hover:text-[#ffcc00]/80 transition"
        >
          {pad(vMinus1)}
        </div>

        {/* Outer Bottom -2 */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
            onChange(vMinus2);
          }}
          className="text-[13px] font-mono text-[#ffcc00]/25 select-none h-6 flex items-center cursor-pointer hover:text-[#ffcc00]/60 transition"
        >
          {pad(vMinus2)}
        </div>

        {/* Sub-label */}
        <div
          className={`text-[9px] tracking-[0.25em] font-black absolute bottom-1 transition ${
            isSelected ? "text-[#ffcc00]" : "text-[#ffcc00]/60 hover:text-[#ffcc00]"
          }`}
        >
          {label}
        </div>
      </div>

      {/* Bottom Stepper Button */}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
          if (!disabled) onChange(wrap(value - 1));
        }}
        className={`w-[96px] h-[34px] rounded-b-[10px] bg-black border border-t-0 text-[12px] tracking-widest font-bold active:scale-[0.96] transition-all flex items-center justify-center gap-1 cursor-pointer z-30 ${
          isSelected
            ? "border-[#ffcc00] text-[#ffcc00] bg-[#1a1a00] shadow-[0_0_12px_rgba(255,204,0,0.3)]"
            : "border-[#ffcc00]/30 text-[#ffcc00]/70 hover:text-[#ffcc00] hover:border-[#ffcc00]"
        }`}
      >
        ▼ <span className="opacity-80 font-mono">{pad(vMinus1)}</span>
      </button>
    </div>
  );
}

const WEEK_DAYS = [
  { short: "S", full: "Sun", day: 0 },
  { short: "M", full: "Mon", day: 1 },
  { short: "T", full: "Tue", day: 2 },
  { short: "W", full: "Wed", day: 3 },
  { short: "T", full: "Thu", day: 4 },
  { short: "F", full: "Fri", day: 5 },
  { short: "S", full: "Sat", day: 6 },
];

export function SamsungTimePicker({
  mode,
  initialHours = 0,
  initialMinutes = 5,
  initialSeconds = 0,
  initialDays = [0, 1, 2, 3, 4, 5, 6],
  initialFocus = "minutes",
  onSave,
  onCancel,
}: SamsungTimePickerProps) {
  const [hours, setHours] = useState<number>(initialHours);
  const [minutes, setMinutes] = useState<number>(initialMinutes);
  const [seconds, setSeconds] = useState<number>(initialSeconds);
  const [selectedDays, setSelectedDays] = useState<number[]>(
    initialDays.length > 0 ? initialDays : [0, 1, 2, 3, 4, 5, 6]
  );
  const [activeUnit, setActiveUnit] = useState<"hours" | "minutes" | "seconds">(initialFocus);

  const toggleDay = (day: number) => {
    setSelectedDays((prev) => {
      if (prev.includes(day)) {
        // Prevent deselecting all days in weekly repeating mode
        if (prev.length === 1) return prev;
        return prev.filter((d) => d !== day);
      } else {
        return [...prev, day].sort((a, b) => a - b);
      }
    });
  };

  const setEveryDay = () => setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
  const setWeekdays = () => setSelectedDays([1, 2, 3, 4, 5]);
  const setWeekends = () => setSelectedDays([0, 6]);

  const handleConfirm = useCallback(() => {
    const total = hours * 3600 + minutes * 60 + (mode === "alarm" ? 0 : seconds);
    onSave({
      hours,
      minutes,
      seconds: mode === "alarm" ? 0 : seconds,
      totalSeconds: total,
      days: mode === "alarm" ? selectedDays : undefined,
    });
  }, [hours, minutes, seconds, mode, selectedDays, onSave]);

  const getDaysSummary = () => {
    if (selectedDays.length === 7) return "EVERY DAY";
    if (selectedDays.length === 5 && [1, 2, 3, 4, 5].every((d) => selectedDays.includes(d))) return "WEEKDAYS (MON–FRI)";
    if (selectedDays.length === 2 && selectedDays.includes(0) && selectedDays.includes(6)) return "WEEKENDS (SAT–SUN)";
    return selectedDays.map((d) => WEEK_DAYS.find((w) => w.day === d)?.full.toUpperCase()).join(", ");
  };

  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="border-2 border-[#ffcc00] rounded-[24px] bg-[#0a0a14] p-4 md:p-5 w-full max-w-[390px] shadow-[0_0_45px_rgba(255,204,0,0.35)] select-none my-auto"
      >
        {/* Header */}
        <div className="text-center text-[15px] tracking-[0.25em] font-black text-[#ffcc00] flex items-center justify-center gap-2">
          <span>{mode === "alarm" ? "ALARM TIME & WEEKLY DAYS" : "OPERATION TIMER SETTER"}</span>
        </div>
        <div className="text-center text-[9px] tracking-[0.22em] text-[#ffcc00]/70 mt-1">
          TAP ANY DIGIT TO EDIT • USE ARROWS TO STEP
        </div>

        {/* Drums Row */}
        <div className="mt-4 flex justify-center gap-2.5">
          <DrumColumn
            unit="hours"
            value={hours}
            max={mode === "alarm" ? 23 : 99}
            label="HOURS"
            isSelected={activeUnit === "hours"}
            onSelect={() => setActiveUnit("hours")}
            onChange={setHours}
          />
          <DrumColumn
            unit="minutes"
            value={minutes}
            max={59}
            label="MINS"
            isSelected={activeUnit === "minutes"}
            onSelect={() => setActiveUnit("minutes")}
            onChange={setMinutes}
          />
          <DrumColumn
            unit="seconds"
            value={seconds}
            max={59}
            label="SECS"
            disabled={mode === "alarm"}
            isSelected={activeUnit === "seconds"}
            onSelect={() => setActiveUnit("seconds")}
            onChange={setSeconds}
          />
        </div>

        {/* Samsung One UI Weekly Day Selector (Alarms Only) */}
        {mode === "alarm" && (
          <div className="mt-4 pt-3 border-t border-[#ffcc00]/30 flex flex-col items-center gap-2.5">
            {/* Quick Preset Buttons */}
            <div className="flex items-center gap-1.5 w-full justify-between">
              <button
                type="button"
                onClick={setEveryDay}
                className={`flex-1 py-1 px-1 rounded text-[10px] font-bold tracking-wider border transition-all ${
                  selectedDays.length === 7
                    ? "bg-[#ffcc00] text-black border-[#ffcc00] shadow-[0_0_8px_rgba(255,204,0,0.4)]"
                    : "border-[#ffcc00]/40 text-[#ffcc00]/70 hover:border-[#ffcc00] hover:text-[#ffcc00]"
                }`}
              >
                EVERY DAY
              </button>
              <button
                type="button"
                onClick={setWeekdays}
                className={`flex-1 py-1 px-1 rounded text-[10px] font-bold tracking-wider border transition-all ${
                  selectedDays.length === 5 && [1, 2, 3, 4, 5].every((d) => selectedDays.includes(d))
                    ? "bg-[#ffcc00] text-black border-[#ffcc00] shadow-[0_0_8px_rgba(255,204,0,0.4)]"
                    : "border-[#ffcc00]/40 text-[#ffcc00]/70 hover:border-[#ffcc00] hover:text-[#ffcc00]"
                }`}
              >
                WEEKDAYS
              </button>
              <button
                type="button"
                onClick={setWeekends}
                className={`flex-1 py-1 px-1 rounded text-[10px] font-bold tracking-wider border transition-all ${
                  selectedDays.length === 2 && selectedDays.includes(0) && selectedDays.includes(6)
                    ? "bg-[#ffcc00] text-black border-[#ffcc00] shadow-[0_0_8px_rgba(255,204,0,0.4)]"
                    : "border-[#ffcc00]/40 text-[#ffcc00]/70 hover:border-[#ffcc00] hover:text-[#ffcc00]"
                }`}
              >
                WEEKENDS
              </button>
            </div>

            {/* Sunday-first Circular Tactile Day Chips */}
            <div className="flex items-center justify-between w-full px-1">
              {WEEK_DAYS.map((w) => {
                const active = selectedDays.includes(w.day);
                return (
                  <button
                    key={w.day}
                    type="button"
                    onClick={() => toggleDay(w.day)}
                    className={`w-9 h-9 rounded-full flex flex-col items-center justify-center font-mono font-black text-xs transition-all active:scale-95 cursor-pointer ${
                      active
                        ? "bg-[#ffcc00] text-black border-2 border-[#ffcc00] shadow-[0_0_12px_rgba(255,204,0,0.5)] scale-105"
                        : "bg-black/60 text-[#ffcc00]/50 border border-[#ffcc00]/30 hover:border-[#ffcc00] hover:text-[#ffcc00]"
                    }`}
                    title={`${w.full} (Tap to toggle)`}
                  >
                    <span>{w.short}</span>
                  </button>
                );
              })}
            </div>

            {/* Recurrence Status Readout */}
            <div className="text-[10px] font-mono tracking-widest text-[#ffcc00]/80 text-center uppercase">
              REPEATS: <span className="text-[#ffcc00] font-bold">{getDaysSummary()}</span>
            </div>
          </div>
        )}

        {/* Modal Actions */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <button
            type="button"
            onClick={handleConfirm}
            className="bg-[#ffcc00] text-black font-black text-[15px] tracking-widest min-h-[44px] rounded-[8px] hover:bg-[#ffcc00]/80 active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(255,204,0,0.3)] cursor-pointer"
          >
            CONFIRM
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="bg-black border border-[#ffcc00] text-[#ffcc00] font-black text-[15px] tracking-widest min-h-[44px] rounded-[8px] hover:bg-[#1a1a00] active:scale-[0.98] transition-all cursor-pointer"
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}
