// src/components/samsung-time-picker.tsx — FULL REPLACEMENT FILE
import React, { useRef, useState, useCallback, useEffect } from "react";

export type SamsungTimePickerValues = {
  hours: number;
  minutes: number;
  seconds: number;
  totalSec: number;
  totalSeconds: number;
  timeStr: string;
  days?: number[] | undefined; // 0 = Sun, 1 = Mon, ..., 6 = Sat
};

export interface SamsungTimePickerProps {
  mode: "timer" | "alarm";
  isOpen?: boolean;
  initialHours?: number | undefined;
  initialMinutes?: number | undefined;
  initialSeconds?: number | undefined;
  initialDurationSec?: number | undefined;
  initialTimeStr?: string | undefined;
  initialDays?: number[] | undefined;
  initialValues?: Partial<SamsungTimePickerValues> | undefined;
  initialFocus?: "hours" | "minutes" | "seconds" | undefined;
  onSave?: (values: SamsungTimePickerValues) => void;
  onConfirm?: (values: SamsungTimePickerValues) => void;
  onCancel: () => void;
  onClose?: () => void;
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
  const safeVal = typeof value === "number" && !isNaN(value) ? Math.max(0, Math.min(max, Math.floor(value))) : 0;
  const range = max + 1;
  const dragRef = useRef({ y: 0, val: safeVal, dragging: false });
  const [isInlineEditing, setIsInlineEditing] = useState(false);
  const [typedValue, setTypedValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const wrap = useCallback((n: number) => ((n % range) + range) % range, [range]);
  const pad = (n: number) => String(isNaN(n) ? 0 : n).padStart(2, "0");

  const vMinus2 = wrap(safeVal - 2);
  const vMinus1 = wrap(safeVal - 1);
  const vPlus1 = wrap(safeVal + 1);
  const vPlus2 = wrap(safeVal + 2);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || isInlineEditing) return;
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("input")) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    dragRef.current = { y: e.clientY, val: safeVal, dragging: true };
    onSelect();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !dragRef.current.dragging) return;
    const deltaY = dragRef.current.y - e.clientY;
    const steps = Math.round(deltaY / 28);
    const next = wrap(dragRef.current.val + steps);
    if (next !== safeVal) onChange(next);
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
    onChange(wrap(safeVal + dir));
  };

  const startInlineEdit = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    if (disabled) return;
    onSelect();
    setIsInlineEditing(true);
    setTypedValue(pad(safeVal));
  };

  useEffect(() => {
    if (isInlineEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isInlineEditing]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 2);
    setTypedValue(raw);
    const num = raw === "" ? 0 : parseInt(raw, 10);
    if (!isNaN(num)) {
      onChange(Math.min(max, Math.max(0, num)));
    }
  };

  const commitInlineEdit = () => {
    setIsInlineEditing(false);
    const num = parseInt(typedValue, 10);
    const finalVal = isNaN(num) ? 0 : Math.min(max, Math.max(0, num));
    setTypedValue(pad(finalVal));
    onChange(finalVal);
  };

  useEffect(() => {
    if (!isSelected || disabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInlineEditing) return;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        onChange(wrap(safeVal + 1));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        onChange(wrap(safeVal - 1));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSelected, disabled, isInlineEditing, onChange, wrap, safeVal]);

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
          onChange(wrap(safeVal + 1));
        }}
        className="w-full py-1 text-[#ffcc00]/60 hover:text-[#ffcc00] hover:bg-[#ffcc00]/10 flex items-center justify-center transition border-b border-[#ffcc00]/20 active:scale-95 disabled:opacity-20"
        title={`Increment ${label} (+1)`}
      >
        <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
          <path d="M10 5l6 7H4z" />
        </svg>
      </button>

      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onClick={onSelect}
        className={`w-[96px] h-[190px] bg-[#05050a] border-x flex flex-col items-center justify-center relative overflow-hidden transition-all touch-none ${
          isSelected
            ? "border-x-[#ffcc00] shadow-[inset_0_0_20px_rgba(255,204,0,0.2)]"
            : "border-x-neutral-800 opacity-80"
        } ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-grab active:cursor-grabbing"}`}
      >
        <div className="absolute top-0 inset-x-0 h-10 bg-gradient-to-b from-black via-black/80 to-transparent pointer-events-none z-10" />
        <div className="absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none z-10" />

        <div
          onClick={(e) => {
            e.stopPropagation();
            onChange(vMinus2);
          }}
          className="h-[32px] flex items-center justify-center text-[18px] text-[#ffcc00]/20 font-mono font-bold select-none cursor-pointer hover:text-[#ffcc00]/40"
        >
          {pad(vMinus2)}
        </div>
        <div
          onClick={(e) => {
            e.stopPropagation();
            onChange(vMinus1);
          }}
          className="h-[36px] flex items-center justify-center text-[22px] text-[#ffcc00]/50 font-mono font-bold select-none cursor-pointer hover:text-[#ffcc00]/70"
        >
          {pad(vMinus1)}
        </div>

        <div className="h-[48px] w-full flex items-center justify-center relative z-20 my-0.5">
          <div className="absolute inset-x-1 inset-y-0.5 border-y-2 border-[#ffcc00] bg-[#ffcc00]/15 pointer-events-none shadow-[0_0_12px_rgba(255,204,0,0.25)]" />
          {isInlineEditing ? (
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={typedValue}
              onChange={handleInputChange}
              onBlur={commitInlineEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitInlineEdit();
                if (e.key === "Escape") setIsInlineEditing(false);
              }}
              className="w-16 h-10 bg-black text-[#ffcc00] text-[32px] font-black font-mono text-center outline-none border border-[#ffcc00] shadow-[0_0_15px_rgba(255,204,0,0.5)] z-30"
            />
          ) : (
            <button
              type="button"
              onClick={startInlineEdit}
              title="Tap to type directly"
              className="text-[34px] font-black font-mono text-[#ffcc00] drop-shadow-[0_0_10px_rgba(255,204,0,0.8)] tracking-tight hover:scale-105 active:scale-95 transition-transform cursor-pointer px-3 py-1"
            >
              {pad(safeVal)}
            </button>
          )}
        </div>

        <div
          onClick={(e) => {
            e.stopPropagation();
            onChange(vPlus1);
          }}
          className="h-[36px] flex items-center justify-center text-[22px] text-[#ffcc00]/50 font-mono font-bold select-none cursor-pointer hover:text-[#ffcc00]/70"
        >
          {pad(vPlus1)}
        </div>
        <div
          onClick={(e) => {
            e.stopPropagation();
            onChange(vPlus2);
          }}
          className="h-[32px] flex items-center justify-center text-[18px] text-[#ffcc00]/20 font-mono font-bold select-none cursor-pointer hover:text-[#ffcc00]/40"
        >
          {pad(vPlus2)}
        </div>
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
          onChange(wrap(safeVal - 1));
        }}
        className="w-full py-1 text-[#ffcc00]/60 hover:text-[#ffcc00] hover:bg-[#ffcc00]/10 flex items-center justify-center transition border-t border-[#ffcc00]/20 active:scale-95 disabled:opacity-20"
        title={`Decrement ${label} (-1)`}
      >
        <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
          <path d="M10 15l-6-7h12z" />
        </svg>
      </button>

      <span
        className={`mt-1.5 text-[11px] font-bold tracking-widest ${
          isSelected ? "text-[#ffcc00]" : "text-neutral-500"
        }`}
      >
        {label}
      </span>
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

const DEFAULT_DAYS = [0, 1, 2, 3, 4, 5, 6];

export function SamsungTimePicker({
  mode,
  isOpen = true,
  initialHours = 0,
  initialMinutes = 0,
  initialSeconds = 0,
  initialDurationSec,
  initialTimeStr,
  initialDays = DEFAULT_DAYS,
  initialValues,
  initialFocus = "minutes",
  onSave,
  onConfirm,
  onCancel,
}: SamsungTimePickerProps) {
  // Normalize incoming values from either seconds, HH:MM string, or direct properties
  let derivedHours = initialHours;
  let derivedMinutes = initialMinutes;
  let derivedSeconds = initialSeconds;

  if (typeof initialDurationSec === "number" && !isNaN(initialDurationSec) && initialDurationSec > 0) {
    derivedHours = Math.floor(initialDurationSec / 3600);
    derivedMinutes = Math.floor((initialDurationSec % 3600) / 60);
    derivedSeconds = initialDurationSec % 60;
  } else if (typeof initialTimeStr === "string" && initialTimeStr.includes(":")) {
    const [h, m] = initialTimeStr.split(":").map((v) => parseInt(v, 10));
    derivedHours = !isNaN(h) ? h : 0;
    derivedMinutes = !isNaN(m) ? m : 0;
    derivedSeconds = 0;
  }

  const effectiveHours = initialValues?.hours ?? derivedHours ?? 0;
  const effectiveMinutes = initialValues?.minutes ?? derivedMinutes ?? 0;
  const effectiveSeconds = initialValues?.seconds ?? derivedSeconds ?? 0;
  const effectiveDays = initialValues?.days ?? initialDays ?? DEFAULT_DAYS;

  const [hours, setHours] = useState(effectiveHours);
  const [minutes, setMinutes] = useState(effectiveMinutes);
  const [seconds, setSeconds] = useState(mode === "alarm" ? 0 : effectiveSeconds);
  const [activeUnit, setActiveUnit] = useState<"hours" | "minutes" | "seconds">(initialFocus);
  const [selectedDays, setSelectedDays] = useState<number[]>(effectiveDays);

  const hoursRef = useRef(hours);
  hoursRef.current = hours;
  const minutesRef = useRef(minutes);
  minutesRef.current = minutes;
  const secondsRef = useRef(seconds);
  secondsRef.current = seconds;
  const selectedDaysRef = useRef(selectedDays);
  selectedDaysRef.current = selectedDays;

  const prevSyncSigRef = useRef<string>("");
  const currentSyncSig = `${mode}:${isOpen}:${effectiveHours}:${effectiveMinutes}:${effectiveSeconds}:${effectiveDays.join(",")}`;

  useEffect(() => {
    if (prevSyncSigRef.current !== currentSyncSig) {
      prevSyncSigRef.current = currentSyncSig;
      setHours(effectiveHours);
      setMinutes(effectiveMinutes);
      setSeconds(mode === "alarm" ? 0 : effectiveSeconds);
      setSelectedDays(effectiveDays);
    }
  }, [currentSyncSig, effectiveHours, effectiveMinutes, effectiveSeconds, effectiveDays, mode]);

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
    const rawH = hoursRef.current;
    const rawM = minutesRef.current;
    const rawS = mode === "alarm" ? 0 : secondsRef.current;

    const h = isNaN(rawH) ? 0 : Math.max(0, Math.min(99, rawH));
    const m = isNaN(rawM) ? 0 : Math.max(0, Math.min(59, rawM));
    const s = isNaN(rawS) ? 0 : Math.max(0, Math.min(59, rawS));
    const totalSec = h * 3600 + m * 60 + s;
    const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

    const result: SamsungTimePickerValues = {
      hours: h,
      minutes: m,
      seconds: s,
      totalSec,
      totalSeconds: totalSec,
      timeStr,
      days: mode === "alarm" ? selectedDaysRef.current : undefined,
    };

    if (onConfirm) onConfirm(result);
    else if (onSave) onSave(result);
  };

  const getDaysSummary = () => {
    if (selectedDays.length === 7) return "EVERY DAY";
    if (selectedDays.length === 5 && [1, 2, 3, 4, 5].every((d) => selectedDays.includes(d))) {
      return "WEEKDAYS (MON–FRI)";
    }
    if (selectedDays.length === 2 && selectedDays.includes(0) && selectedDays.includes(6)) {
      return "WEEKENDS (SAT–SUN)";
    }
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
        <div className="text-center mb-4">
          <span className="text-[11px] font-mono tracking-widest text-[#ffcc00]/70 uppercase">
            {mode === "timer" ? "OPERATION TIMER SETTER" : "ALARM TIME & WEEKLY DAYS"}
          </span>
          <div className="text-[20px] font-mono font-black text-[#ffcc00] tracking-wider mt-0.5">
            {String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}
            {mode === "timer" && `:${String(seconds).padStart(2, "0")}`}
          </div>
        </div>

        <div className="flex items-center justify-center gap-1 sm:gap-2 mb-4 bg-black/40 p-2.5 rounded-xl border border-[#ffcc00]/20">
          <DrumColumn
            unit="hours"
            value={hours}
            max={mode === "alarm" ? 23 : 99}
            label="HOURS"
            isSelected={activeUnit === "hours"}
            onSelect={() => setActiveUnit("hours")}
            onChange={setHours}
          />
          <span className="text-3xl font-black text-[#ffcc00]/60 pb-8">:</span>
          <DrumColumn
            unit="minutes"
            value={minutes}
            max={59}
            label="MINS"
            isSelected={activeUnit === "minutes"}
            onSelect={() => setActiveUnit("minutes")}
            onChange={setMinutes}
          />
          {mode === "timer" && (
            <>
              <span className="text-3xl font-black text-[#ffcc00]/60 pb-8">:</span>
              <DrumColumn
                unit="seconds"
                value={seconds}
                max={59}
                label="SECS"
                isSelected={activeUnit === "seconds"}
                onSelect={() => setActiveUnit("seconds")}
                onChange={setSeconds}
              />
            </>
          )}
        </div>

        {mode === "alarm" && (
          <div className="mb-4 bg-black/40 p-3 rounded-xl border border-[#ffcc00]/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono text-[#ffcc00]/60 uppercase tracking-widest">
                REPEAT SCHEDULE
              </span>
              <span className="text-[10px] font-mono font-bold text-[#ffcc00] uppercase tracking-wider">
                {getDaysSummary()}
              </span>
            </div>

            <div className="flex items-center justify-between gap-1 mb-2">
              {WEEK_DAYS.map((w) => {
                const isSelected = selectedDays.includes(w.day);
                return (
                  <button
                    key={w.day}
                    type="button"
                    onClick={() => toggleDay(w.day)}
                    className={`w-9 h-9 rounded-full font-mono text-xs font-bold transition-all flex items-center justify-center ${
                      isSelected
                        ? "bg-[#ffcc00] text-black shadow-[0_0_10px_rgba(255,204,0,0.5)] scale-105"
                        : "bg-black/60 text-[#ffcc00]/40 border border-[#ffcc00]/20 hover:border-[#ffcc00]/50"
                    }`}
                    title={w.full}
                  >
                    {w.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-center gap-2 pt-1 border-t border-[#ffcc00]/10">
              <button
                type="button"
                onClick={() => setSelectedDays([0, 1, 2, 3, 4, 5, 6])}
                className="text-[10px] font-mono text-[#ffcc00]/60 hover:text-[#ffcc00] px-2 py-0.5 border border-[#ffcc00]/20 rounded hover:border-[#ffcc00]/50"
              >
                EVERY DAY
              </button>
              <button
                type="button"
                onClick={() => setSelectedDays([1, 2, 3, 4, 5])}
                className="text-[10px] font-mono text-[#ffcc00]/60 hover:text-[#ffcc00] px-2 py-0.5 border border-[#ffcc00]/20 rounded hover:border-[#ffcc00]/50"
              >
                MON–FRI
              </button>
              <button
                type="button"
                onClick={() => setSelectedDays([0, 6])}
                className="text-[10px] font-mono text-[#ffcc00]/60 hover:text-[#ffcc00] px-2 py-0.5 border border-[#ffcc00]/20 rounded hover:border-[#ffcc00]/50"
              >
                WEEKENDS
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#ffcc00]/20">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-[#ffcc00]/60 hover:text-[#ffcc00] border border-transparent hover:border-[#ffcc00]/30 rounded transition"
          >
            CANCEL
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-6 py-2 bg-[#ffcc00] text-black font-mono text-xs font-black uppercase tracking-widest rounded shadow-[0_0_15px_rgba(255,204,0,0.4)] hover:bg-[#ffd633] active:scale-95 transition"
          >
            CONFIRM
          </button>
        </div>
      </div>
    </div>
  );
}
