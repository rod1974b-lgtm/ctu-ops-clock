import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface DrumColumnProps {
  label: string;
  value: number;
  max: number;
  min?: number;
  step?: number;
  pad?: number;
  onChange: (val: number) => void;
}

function DrumColumn({ label, value, max, min = 0, step = 1, pad = 2, onChange }: DrumColumnProps) {
  const rangeSize = max - min + 1;

  // Up button & top slot: INCREMENTS (+step)
  const incVal = value + step > max ? min + ((value + step - max - 1) % rangeSize) : value + step;
  // Down button & bottom slot: DECREMENTS (-step)
  const decVal = value - step < min ? max - ((min - (value - step) - 1) % rangeSize) : value - step;

  const [isFocused, setIsFocused] = useState(false);
  const [inputValue, setInputValue] = useState(String(value).padStart(pad, "0"));

  useEffect(() => {
    if (!isFocused) {
      setInputValue(String(value).padStart(pad, "0"));
    }
  }, [value, pad, isFocused]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (e.deltaY < 0) {
        onChange(incVal);
      } else if (e.deltaY > 0) {
        onChange(decVal);
      }
    },
    [incVal, decVal, onChange]
  );

  return (
    <div className="samsung-drum-column" onWheel={handleWheel}>
      <span className="drum-column-label">{label}</span>
      <button
        type="button"
        className="drum-step-btn"
        onClick={() => onChange(incVal)}
        aria-label={`Increase ${label}`}
      >
        <ChevronUp className="h-4 w-4" />
      </button>

      <div className="drum-barrel">
        {/* Top slot (incremented value) */}
        <button
          type="button"
          tabIndex={-1}
          className="drum-slot drum-slot-neighbor"
          onClick={() => onChange(incVal)}
          title={`Set ${label} to ${String(incVal).padStart(pad, "0")}`}
        >
          {String(incVal).padStart(pad, "0")}
        </button>

        {/* Center active slot: direct editable input */}
        <div className="drum-slot drum-slot-active">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={Math.max(pad, String(max).length)}
            value={inputValue}
            onFocus={(e) => {
              setIsFocused(true);
              e.target.select();
            }}
            onBlur={() => {
              setIsFocused(false);
              const num = parseInt(inputValue, 10);
              if (isNaN(num)) {
                setInputValue(String(value).padStart(pad, "0"));
              } else {
                const clamped = Math.min(max, Math.max(min, num));
                onChange(clamped);
                setInputValue(String(clamped).padStart(pad, "0"));
              }
            }}
            onChange={(e) => {
              const cleaned = e.target.value.replace(/\D/g, "");
              setInputValue(cleaned);
              if (cleaned.length > 0) {
                const num = parseInt(cleaned, 10);
                if (!isNaN(num) && num <= max && num >= min) {
                  onChange(num);
                }
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                (e.target as HTMLInputElement).blur();
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                onChange(incVal);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                onChange(decVal);
              }
            }}
            style={{
              background: isFocused ? "color-mix(in oklch, var(--primary) 12%, transparent)" : "transparent",
              color: "var(--primary)",
              border: isFocused ? "1px solid var(--primary)" : "1px solid transparent",
              borderRadius: "4px",
              outline: "none",
              textAlign: "center",
              width: "72px",
              fontSize: "44px",
              fontFamily: "var(--font-mono)",
              lineHeight: "1.1",
              fontVariantNumeric: "tabular-nums",
              textShadow: "0 0 12px color-mix(in oklch, var(--primary) 50%, transparent)",
              cursor: isFocused ? "text" : "pointer",
            }}
            aria-label={`${label} numeric entry`}
          />
        </div>

        {/* Bottom slot (decremented value) */}
        <button
          type="button"
          tabIndex={-1}
          className="drum-slot drum-slot-neighbor"
          onClick={() => onChange(decVal)}
          title={`Set ${label} to ${String(decVal).padStart(pad, "0")}`}
        >
          {String(decVal).padStart(pad, "0")}
        </button>
      </div>

      <button
        type="button"
        className="drum-step-btn"
        onClick={() => onChange(decVal)}
        aria-label={`Decrease ${label}`}
      >
        <ChevronDown className="h-4 w-4" />
      </button>
    </div>
  );
}

export interface SamsungTimerValues {
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
}

export interface SamsungTimePickerProps {
  mode: "countdown" | "timer" | "alarm";
  timerValues?: SamsungTimerValues;
  values?: SamsungTimerValues;
  onTimerChange?: (values: SamsungTimerValues) => void;
  onChange?: (values: SamsungTimerValues) => void;
  alarmTime?: string;
  onAlarmChange?: (timeStr: string) => void;
}

export function SamsungTimePicker({
  mode,
  timerValues,
  values,
  onTimerChange,
  onChange,
  alarmTime = "09:00:00",
  onAlarmChange,
}: SamsungTimePickerProps) {
  const isCountdown = mode === "countdown" || mode === "timer";

  const resolvedTimerValues = timerValues ?? values ?? {
    hours: 0,
    minutes: 25,
    seconds: 0,
    totalSeconds: 1500,
  };
  const fireTimerChange = onTimerChange ?? onChange;

  const hours = resolvedTimerValues.hours;
  const minutes = resolvedTimerValues.minutes;
  const seconds = resolvedTimerValues.seconds;

  const [use12Hour, setUse12Hour] = useState(false);
  const [alarmPeriod, setAlarmPeriod] = useState<"AM" | "PM">("AM");

  const parseAlarm = useCallback((str: string) => {
    const parts = str.split(":").map((n) => Number(n) || 0);
    return {
      h: parts[0] ?? 9,
      m: parts[1] ?? 0,
      s: parts[2] ?? 0,
    };
  }, []);

  const [alarmH, setAlarmH] = useState(() => parseAlarm(alarmTime).h);
  const [alarmM, setAlarmM] = useState(() => parseAlarm(alarmTime).m);
  const [alarmS, setAlarmS] = useState(() => parseAlarm(alarmTime).s);

  useEffect(() => {
    const p = parseAlarm(alarmTime);
    setAlarmH(p.h);
    setAlarmM(p.m);
    setAlarmS(p.s);
    if (p.h >= 12) {
      setAlarmPeriod("PM");
    } else {
      setAlarmPeriod("AM");
    }
  }, [alarmTime, parseAlarm]);

  const emitAlarm = (h: number, m: number, s: number) => {
    const formatted = [
      String(h).padStart(2, "0"),
      String(m).padStart(2, "0"),
      String(s).padStart(2, "0"),
    ].join(":");
    onAlarmChange?.(formatted);
  };

  const handleCountdownChange = (newH: number, newM: number, newS: number) => {
    const total = newH * 3600 + newM * 60 + newS;
    fireTimerChange?.({
      hours: newH,
      minutes: newM,
      seconds: newS,
      totalSeconds: total,
    });
  };

  const addSecondsToCountdown = (deltaSec: number) => {
    const currentTotal = hours * 3600 + minutes * 60 + seconds;
    const nextTotal = Math.min(359999, Math.max(0, currentTotal + deltaSec));
    const h = Math.floor(nextTotal / 3600);
    const m = Math.floor((nextTotal % 3600) / 60);
    const s = nextTotal % 60;
    handleCountdownChange(h, m, s);
  };

  const display12H = alarmH % 12 === 0 ? 12 : alarmH % 12;

  const handle12HourChange = (new12H: number) => {
    let military = new12H;
    if (alarmPeriod === "AM") {
      military = new12H === 12 ? 0 : new12H;
    } else {
      military = new12H === 12 ? 12 : new12H + 12;
    }
    setAlarmH(military);
    emitAlarm(military, alarmM, alarmS);
  };

  const togglePeriod = (p: "AM" | "PM") => {
    setAlarmPeriod(p);
    let military = alarmH;
    if (p === "AM" && military >= 12) {
      military -= 12;
    } else if (p === "PM" && military < 12) {
      military += 12;
    }
    setAlarmH(military);
    emitAlarm(military, alarmM, alarmS);
  };

  if (isCountdown) {
    return (
      <div className="samsung-picker-container">
        <div className="samsung-picker-drums">
          <DrumColumn
            label="HOURS"
            value={hours}
            max={99}
            min={0}
            onChange={(h) => handleCountdownChange(h, minutes, seconds)}
          />
          <span className="samsung-drum-colon">:</span>
          <DrumColumn
            label="MINUTES"
            value={minutes}
            max={59}
            min={0}
            onChange={(m) => handleCountdownChange(hours, m, seconds)}
          />
          <span className="samsung-drum-colon">:</span>
          <DrumColumn
            label="SECONDS"
            value={seconds}
            max={59}
            min={0}
            onChange={(s) => handleCountdownChange(hours, minutes, s)}
          />
        </div>

        {/* Quick-Add Chips */}
        <div className="samsung-quick-chips">
          <button
            type="button"
            className="tactical-chip"
            onClick={() => addSecondsToCountdown(3600)}
          >
            +1h
          </button>
          <button
            type="button"
            className="tactical-chip"
            onClick={() => addSecondsToCountdown(900)}
          >
            +15m
          </button>
          <button
            type="button"
            className="tactical-chip"
            onClick={() => addSecondsToCountdown(300)}
          >
            +5m
          </button>
          <button
            type="button"
            className="tactical-chip"
            onClick={() => addSecondsToCountdown(60)}
          >
            +1m
          </button>
          <button
            type="button"
            className="tactical-chip"
            onClick={() => addSecondsToCountdown(30)}
          >
            +30s
          </button>
          <button
            type="button"
            className="tactical-chip chip-clear"
            onClick={() => handleCountdownChange(0, 0, 0)}
          >
            CLEAR
          </button>
        </div>
      </div>
    );
  }

  // Daily Alarm Mode
  const now = new Date();
  const target = new Date(now);
  target.setHours(alarmH, alarmM, alarmS, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  const diffSec = Math.floor((target.getTime() - now.getTime()) / 1000);
  const diffH = Math.floor(diffSec / 3600);
  const diffM = Math.floor((diffSec % 3600) / 60);
  const diffS = diffSec % 60;

  return (
    <div className="samsung-picker-container">
      <div className="samsung-format-bar">
        <div className="format-toggle-group">
          <button
            type="button"
            className={`format-btn ${!use12Hour ? "active" : ""}`}
            onClick={() => setUse12Hour(false)}
          >
            24-HOUR
          </button>
          <button
            type="button"
            className={`format-btn ${use12Hour ? "active" : ""}`}
            onClick={() => setUse12Hour(true)}
          >
            12-HOUR
          </button>
        </div>

        {use12Hour && (
          <div className="period-toggle-group">
            <button
              type="button"
              className={`period-btn ${alarmPeriod === "AM" ? "active" : ""}`}
              onClick={() => togglePeriod("AM")}
            >
              AM
            </button>
            <button
              type="button"
              className={`period-btn ${alarmPeriod === "PM" ? "active" : ""}`}
              onClick={() => togglePeriod("PM")}
            >
              PM
            </button>
          </div>
        )}
      </div>

      <div className="samsung-picker-drums">
        {use12Hour ? (
          <DrumColumn
            label="HOURS (1-12)"
            value={display12H}
            max={12}
            min={1}
            pad={2}
            onChange={handle12HourChange}
          />
        ) : (
          <DrumColumn
            label="HOURS (00-23)"
            value={alarmH}
            max={23}
            min={0}
            pad={2}
            onChange={(h) => {
              setAlarmH(h);
              emitAlarm(h, alarmM, alarmS);
            }}
          />
        )}
        <span className="samsung-drum-colon">:</span>
        <DrumColumn
          label="MINUTES"
          value={alarmM}
          max={59}
          min={0}
          pad={2}
          onChange={(m) => {
            setAlarmM(m);
            emitAlarm(alarmH, m, alarmS);
          }}
        />
        <span className="samsung-drum-colon">:</span>
        <DrumColumn
          label="SECONDS"
          value={alarmS}
          max={59}
          min={0}
          pad={2}
          onChange={(s) => {
            setAlarmS(s);
            emitAlarm(alarmH, alarmM, s);
          }}
        />
      </div>

      <div className="samsung-alarm-summary">
        <span className="summary-icon">⏱</span>
        <span>
          Alarm sounds in{" "}
          <strong>
            {diffH > 0 && `${diffH} hr `}
            {diffM} min {diffS} sec
          </strong>
        </span>
      </div>
    </div>
  );
}
