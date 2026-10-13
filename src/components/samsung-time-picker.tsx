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

  const prevVal = (value - step < min ? max - ((min - (value - step) - 1) % rangeSize) : value - step);
  const nextVal = (value + step > max ? min + ((value + step - max - 1) % rangeSize) : value + step);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (e.deltaY < 0) {
        onChange(prevVal);
      } else if (e.deltaY > 0) {
        onChange(nextVal);
      }
    },
    [prevVal, nextVal, onChange]
  );

  return (
    <div className="samsung-drum-column" onWheel={handleWheel}>
      <span className="drum-column-label">{label}</span>
      <button
        type="button"
        className="drum-step-btn"
        onClick={() => onChange(prevVal)}
        aria-label={`Increment ${label}`}
      >
        <ChevronUp className="h-4 w-4" />
      </button>

      <div className="drum-barrel">
        <button
          type="button"
          tabIndex={-1}
          className="drum-slot drum-slot-neighbor"
          onClick={() => onChange(prevVal)}
        >
          {String(prevVal).padStart(pad, "0")}
        </button>

        <div className="drum-slot drum-slot-active">
          <span>{String(value).padStart(pad, "0")}</span>
        </div>

        <button
          type="button"
          tabIndex={-1}
          className="drum-slot drum-slot-neighbor"
          onClick={() => onChange(nextVal)}
        >
          {String(nextVal).padStart(pad, "0")}
        </button>
      </div>

      <button
        type="button"
        className="drum-step-btn"
        onClick={() => onChange(nextVal)}
        aria-label={`Decrement ${label}`}
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

interface SamsungTimePickerProps {
  mode: "countdown" | "alarm";
  // Countdown props
  timerValues?: SamsungTimerValues;
  onTimerChange?: (values: SamsungTimerValues) => void;
  // Alarm props
  alarmTime?: string; // "HH:MM:SS" or "HH:MM"
  onAlarmChange?: (timeStr: string) => void;
}

export function SamsungTimePicker({
  mode,
  timerValues,
  onTimerChange,
  alarmTime = "09:00:00",
  onAlarmChange,
}: SamsungTimePickerProps) {
  // Countdown local state
  const hours = timerValues?.hours ?? 0;
  const minutes = timerValues?.minutes ?? 25;
  const seconds = timerValues?.seconds ?? 0;

  // Alarm local state
  const [use12Hour, setUse12Hour] = useState(false);
  const [alarmPeriod, setAlarmPeriod] = useState<"AM" | "PM">("AM");

  // Parse initial alarmTime
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
    onTimerChange?.({
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

  // 12-Hour Alarm Handlers
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

  if (mode === "countdown") {
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

        {/* Quick-Add Chips — Timer Only */}
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

  // Daily Alarm Mode (Both 24H and 12H formats, no quick-add chips)
  return (
    <div className="samsung-picker-container">
      {/* 12H / 24H Selector for Alarm */}
      <div className="alarm-format-toggle-bar">
        <span className="toggle-label">TIME PROTOCOL:</span>
        <div className="alarm-format-pills">
          <button
            type="button"
            className={`alarm-pill ${!use12Hour ? "active" : ""}`}
            onClick={() => setUse12Hour(false)}
          >
            24-HOUR MILITARY
          </button>
          <button
            type="button"
            className={`alarm-pill ${use12Hour ? "active" : ""}`}
            onClick={() => setUse12Hour(true)}
          >
            12-HOUR CIVILIAN
          </button>
        </div>
      </div>

      <div className="samsung-picker-drums">
        {use12Hour ? (
          <>
            <div className="ampm-column">
              <span className="drum-column-label">PERIOD</span>
              <div className="ampm-barrel">
                <button
                  type="button"
                  className={`ampm-btn ${alarmPeriod === "AM" ? "active" : ""}`}
                  onClick={() => togglePeriod("AM")}
                >
                  AM
                </button>
                <button
                  type="button"
                  className={`ampm-btn ${alarmPeriod === "PM" ? "active" : ""}`}
                  onClick={() => togglePeriod("PM")}
                >
                  PM
                </button>
              </div>
            </div>

            <DrumColumn
              label="HOURS"
              value={display12H}
              max={12}
              min={1}
              onChange={handle12HourChange}
            />
          </>
        ) : (
          <DrumColumn
            label="HOURS"
            value={alarmH}
            max={23}
            min={0}
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
          onChange={(s) => {
            setAlarmS(s);
            emitAlarm(alarmH, alarmM, s);
          }}
        />
      </div>
    </div>
  );
}
