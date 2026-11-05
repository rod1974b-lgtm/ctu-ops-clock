// src/components/samsung-time-picker.tsx
import React, { useRef, useState, useCallback, useEffect } from "react";

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

  // Drag handling only when not clicking an interactive button/input
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

  // Keyboard navigation when this drum column is active
  useEffect(() => {
    if (!isSelected || disabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInlineEditing) return;
      if (e.key >= "0" && e.key <= "9") {
        setIsInlineEditing(true);
        setTypedValue(e.key);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        onChange(wrap(value + 1));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        onChange(wrap(value - 1));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSelected, disabled, isInlineEditing, value, wrap, onChange]);

  return (
    <div
      className={`relative flex flex-col items-center select-none transition-all ${
        disabled ? "opacity-20 pointer-events-none" : ""
      }`}
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

      {/* Drum Body */}
      <div
        className={`relative w-[96px] h-[200px] overflow-hidden touch-none transition-all ${
          isSelected
            ? "bg-[#18182c] border-x-2 border-[#ffcc00] shadow-[0_0_24px_rgba(255,204,0,0.25)]"
            : "bg-[#111120] border-x-2 border-[#ffcc00]/40"
        }`}
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onClick={onSelect}
      >
        {/* Top & Bottom Vignette Fade */}
        <div className="absolute inset-x-0 top-0 h-[50px] bg-gradient-to-b from-black via-black/80 to-transparent pointer-events-none z-20" />
        <div className="absolute inset-x-0 bottom-0 h-[50px] bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none z-20" />

        {/* Center Glowing Target Box */}
        <div
          className={`absolute left-1.5 right-1.5 top-1/2 -translate-y-1/2 h-[56px] rounded-[10px] z-10 pointer-events-none border transition-all ${
            isSelected
              ? "bg-[#ffcc00]/[0.18] border-[#ffcc00] shadow-[inset_0_0_18px_rgba(255,204,0,0.35)]"
              : "bg-[#ffcc00]/[0.08] border-[#ffcc00]/30"
          }`}
        />

        {/* Digit Stack */}
        <div className="absolute inset-0 flex flex-col items-center justify-center z-15">
          {/* -2 Value */}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
              onChange(vMinus2);
            }}
            className="text-[12px] font-bold tracking-[0.18em] text-white/30 hover:text-[#ffcc00] hover:scale-110 active:scale-95 transition-all cursor-pointer py-1 px-3 z-25"
          >
            {pad(vMinus2)}
          </button>

          {/* -1 Value */}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
              onChange(vMinus1);
            }}
            className="text-[15px] font-bold tracking-[0.18em] text-white/50 hover:text-[#ffcc00] hover:scale-110 active:scale-95 transition-all cursor-pointer py-1 px-3 z-25"
          >
            {pad(vMinus1)}
          </button>

          {/* Center Active Value */}
          <div className="my-[2px] relative z-30">
            {isInlineEditing ? (
              <input
                ref={inputRef}
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                min={0}
                max={max}
                value={typedValue}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 2);
                  setTypedValue(val);
                }}
                onBlur={commitInlineEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitInlineEdit();
                  if (e.key === "Escape") setIsInlineEditing(false);
                }}
                className="w-[84px] h-[50px] bg-black border-2 border-[#ffcc00] text-center text-[34px] font-black text-[#ffcc00] rounded-[10px] focus:outline-none shadow-[0_0_20px_rgba(255,204,0,0.85)]"
              />
            ) : (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={startInlineEdit}
                title="Tap or click to change number"
                className={`group px-2 py-1 rounded-[10px] transition-all cursor-pointer flex flex-col items-center select-none ${
                  isSelected
                    ? "text-[#ffcc00] scale-105"
                    : "text-white hover:text-[#ffcc00]"
                }`}
              >
                <span className="text-[36px] font-black tracking-[0.16em] drop-shadow-[0_0_16px_rgba(255,204,0,0.8)] leading-none">
                  {pad(value)}
                </span>
                <span className="text-[8px] tracking-widest text-[#ffcc00] font-bold mt-1 bg-black/70 px-1.5 py-0.5 rounded border border-[#ffcc00]/40 group-hover:bg-[#ffcc00] group-hover:text-black transition-all">
                  TAP TO EDIT
                </span>
              </button>
            )}
          </div>

          {/* +1 Value */}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
              onChange(vPlus1);
            }}
            className="text-[15px] font-bold tracking-[0.18em] text-white/50 hover:text-[#ffcc00] hover:scale-110 active:scale-95 transition-all cursor-pointer py-1 px-3 z-25"
          >
            {pad(vPlus1)}
          </button>

          {/* +2 Value */}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
              onChange(vPlus2);
            }}
            className="text-[12px] font-bold tracking-[0.18em] text-white/30 hover:text-[#ffcc00] hover:scale-110 active:scale-95 transition-all cursor-pointer py-1 px-3 z-25"
          >
            {pad(vPlus2)}
          </button>
        </div>

        {/* Column Label */}
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          className={`absolute bottom-[6px] left-0 right-0 text-center text-[9px] tracking-[0.25em] font-black z-25 cursor-pointer ${
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

export function SamsungTimePicker({
  mode,
  initialHours = 0,
  initialMinutes = 5,
  initialSeconds = 0,
  initialFocus = "minutes",
  onSave,
  onCancel,
}: SamsungTimePickerProps) {
  const [hours, setHours] = useState<number>(initialHours);
  const [minutes, setMinutes] = useState<number>(initialMinutes);
  const [seconds, setSeconds] = useState<number>(initialSeconds);
  const [activeUnit, setActiveUnit] = useState<"hours" | "minutes" | "seconds">(initialFocus);
  const [keypadBuffer, setKeypadBuffer] = useState<string>("");
  const [showKeypad, setShowKeypad] = useState<boolean>(true);

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

  const handleKeypadPress = (digit: string) => {
    const nextBuf = keypadBuffer + digit;
    const num = parseInt(nextBuf, 10);

    if (activeUnit === "hours") {
      const maxH = mode === "alarm" ? 23 : 99;
      const validVal = Math.min(maxH, num);
      setHours(validVal);
      if (nextBuf.length >= 2 || num * 10 > maxH) {
        setKeypadBuffer("");
        setActiveUnit("minutes");
      } else {
        setKeypadBuffer(nextBuf);
      }
    } else if (activeUnit === "minutes") {
      const validVal = Math.min(59, num);
      setMinutes(validVal);
      if (nextBuf.length >= 2 || num >= 6) {
        setKeypadBuffer("");
        if (mode === "timer") setActiveUnit("seconds");
      } else {
        setKeypadBuffer(nextBuf);
      }
    } else if (activeUnit === "seconds" && mode === "timer") {
      const validVal = Math.min(59, num);
      setSeconds(validVal);
      if (nextBuf.length >= 2 || num >= 6) {
        setKeypadBuffer("");
      } else {
        setKeypadBuffer(nextBuf);
      }
    }
  };

  const handleBackspace = () => {
    setKeypadBuffer("");
    if (activeUnit === "hours") setHours(0);
    else if (activeUnit === "minutes") setMinutes(0);
    else if (activeUnit === "seconds") setSeconds(0);
  };

  return (
    <div className="border-2 border-[#ffcc00] rounded-[24px] bg-[#0a0a14] p-4 md:p-5 w-full max-w-[420px] shadow-[0_0_45px_rgba(255,204,0,0.35)] select-none">
      {/* Header */}
      <div className="text-center text-[15px] tracking-[0.25em] font-black text-[#ffcc00] flex items-center justify-center gap-2">
        <span>{mode === "alarm" ? "ALARM TIME SETTER" : "OPERATION TIMER SETTER"}</span>
      </div>
      <div className="text-center text-[9px] tracking-[0.22em] text-[#ffcc00]/70 mt-1">
        TAP ANY NUMBER TO EDIT • USE ARROWS OR KEYPAD
      </div>

      {/* Drums Row */}
      <div className="mt-4 flex justify-center gap-2.5">
        <DrumColumn
          unit="hours"
          value={hours}
          max={mode === "alarm" ? 23 : 99}
          label="HOURS"
          isSelected={activeUnit === "hours"}
          onSelect={() => {
            setActiveUnit("hours");
            setKeypadBuffer("");
          }}
          onChange={setHours}
        />
        <DrumColumn
          unit="minutes"
          value={minutes}
          max={59}
          label="MINS"
          isSelected={activeUnit === "minutes"}
          onSelect={() => {
            setActiveUnit("minutes");
            setKeypadBuffer("");
          }}
          onChange={setMinutes}
        />
        <DrumColumn
          unit="seconds"
          value={seconds}
          max={59}
          label="SECS"
          disabled={mode === "alarm"}
          isSelected={activeUnit === "seconds"}
          onSelect={() => {
            setActiveUnit("seconds");
            setKeypadBuffer("");
          }}
          onChange={setSeconds}
        />
      </div>

      {/* Segmented Clickable Readout Pill */}
      <div className="mt-4 flex flex-col items-center">
        <div className="inline-flex items-center gap-1.5 px-4 py-2 bg-black border-2 border-[#ffcc00]/40 rounded-full shadow-[0_0_20px_rgba(255,204,0,0.18)]">
          {/* Hours button */}
          <button
            type="button"
            onClick={() => {
              setActiveUnit("hours");
              setKeypadBuffer("");
            }}
            className={`px-2.5 py-0.5 rounded-lg font-black text-[22px] tracking-widest transition-all cursor-pointer ${
              activeUnit === "hours"
                ? "bg-[#ffcc00] text-black shadow-[0_0_12px_rgba(255,204,0,0.7)] scale-105"
                : "text-white hover:text-[#ffcc00]"
            }`}
          >
            {pad(hours)}
          </button>
          <span className="text-[#ffcc00] text-[20px] font-black">:</span>

          {/* Minutes button */}
          <button
            type="button"
            onClick={() => {
              setActiveUnit("minutes");
              setKeypadBuffer("");
            }}
            className={`px-2.5 py-0.5 rounded-lg font-black text-[22px] tracking-widest transition-all cursor-pointer ${
              activeUnit === "minutes"
                ? "bg-[#ffcc00] text-black shadow-[0_0_12px_rgba(255,204,0,0.7)] scale-105"
                : "text-white hover:text-[#ffcc00]"
            }`}
          >
            {pad(minutes)}
          </button>
          <span className="text-[#ffcc00] text-[20px] font-black">:</span>

          {/* Seconds button */}
          <button
            type="button"
            disabled={mode === "alarm"}
            onClick={() => {
              if (mode === "timer") {
                setActiveUnit("seconds");
                setKeypadBuffer("");
              }
            }}
            className={`px-2.5 py-0.5 rounded-lg font-black text-[22px] tracking-widest transition-all cursor-pointer ${
              mode === "alarm"
                ? "text-white/20 cursor-not-allowed"
                : activeUnit === "seconds"
                  ? "bg-[#ffcc00] text-black shadow-[0_0_12px_rgba(255,204,0,0.7)] scale-105"
                  : "text-white hover:text-[#ffcc00]"
            }`}
          >
            {mode === "alarm" ? "--" : pad(seconds)}
          </button>

          <span className="text-[10px] tracking-widest font-black text-[#ffcc00]/80 ml-2 border-l border-[#ffcc00]/30 pl-2">
            {activeUnit.toUpperCase()}
          </span>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            onClick={() => setShowKeypad(!showKeypad)}
            className="text-[10px] tracking-widest text-[#ffcc00] hover:underline font-bold"
          >
            {showKeypad ? "▲ HIDE KEYPAD" : "▼ SHOW NUMBER KEYPAD"}
          </button>
        </div>
      </div>

      {/* Samsung Quick Number Pad */}
      {showKeypad && (
        <div className="mt-3 bg-black/90 border border-[#ffcc00]/30 rounded-[14px] p-2.5">
          <div className="flex justify-between items-center mb-1.5 px-1">
            <span className="text-[9px] tracking-widest text-[#ffcc00]/80 font-bold">
              TAP NUMBERS FOR [{activeUnit.toUpperCase()}]:
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => {
                  if (activeUnit === "minutes") setMinutes((m) => Math.min(59, m + 1));
                  else if (activeUnit === "seconds") setSeconds((s) => Math.min(59, s + 1));
                  else setHours((h) => Math.min(23, h + 1));
                }}
                className="text-[9px] px-2 py-0.5 bg-[#1a1a00] border border-[#ffcc00]/40 text-[#ffcc00] rounded hover:bg-[#ffcc00] hover:text-black font-bold"
              >
                +1
              </button>
              <button
                type="button"
                onClick={() => {
                  if (activeUnit === "minutes") setMinutes((m) => Math.min(59, m + 5));
                  else if (activeUnit === "seconds") setSeconds((s) => Math.min(59, s + 5));
                  else setHours((h) => Math.min(23, h + 1));
                }}
                className="text-[9px] px-2 py-0.5 bg-[#1a1a00] border border-[#ffcc00]/40 text-[#ffcc00] rounded hover:bg-[#ffcc00] hover:text-black font-bold"
              >
                +5
              </button>
              <button
                type="button"
                onClick={() => {
                  if (activeUnit === "minutes") setMinutes((m) => Math.min(59, m + 15));
                  else if (activeUnit === "seconds") setSeconds((s) => Math.min(59, s + 15));
                  else setHours((h) => Math.min(23, h + 5));
                }}
                className="text-[9px] px-2 py-0.5 bg-[#1a1a00] border border-[#ffcc00]/40 text-[#ffcc00] rounded hover:bg-[#ffcc00] hover:text-black font-bold"
              >
                +15
              </button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleKeypadPress(String(digit))}
                className="min-h-[38px] rounded-[6px] bg-[#121220] border border-[#ffcc00]/30 text-[#ffcc00] font-black text-[16px] hover:bg-[#ffcc00] hover:text-black active:scale-95 transition-all cursor-pointer"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                if (activeUnit === "hours") setHours(0);
                if (activeUnit === "minutes") setMinutes(0);
                if (activeUnit === "seconds") setSeconds(0);
                setKeypadBuffer("");
              }}
              className="min-h-[38px] rounded-[6px] bg-[#1a1010] border border-red-500/40 text-red-400 font-bold text-[11px] tracking-wider hover:bg-red-500 hover:text-black active:scale-95 transition-all cursor-pointer"
            >
              ZERO
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="min-h-[38px] rounded-[6px] bg-[#201a00] border border-[#ffcc00]/50 text-[#ffcc00] font-bold text-[12px] hover:bg-[#ffcc00] hover:text-black active:scale-95 transition-all cursor-pointer"
            >
              DEL
            </button>
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
  );
}
