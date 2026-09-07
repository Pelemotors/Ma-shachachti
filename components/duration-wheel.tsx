"use client";
import { useEffect, useId, useRef } from "react";

const MINUTE_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] as const;

export function DurationWheel({
  hours,
  minutes,
  onChange,
  label = "משך זמן",
}: {
  hours: number;
  minutes: number;
  onChange: (next: { hours: number; minutes: number }) => void;
  label?: string;
}) {
  const hoursRef = useRef<HTMLDivElement>(null);
  const minutesRef = useRef<HTMLDivElement>(null);
  const labelId = useId();

  useEffect(() => {
    const hEl = hoursRef.current?.children[hours] as HTMLElement | undefined;
    hEl?.scrollIntoView({ block: "center" });
    const mIndex = MINUTE_OPTIONS.indexOf(
      minutes as (typeof MINUTE_OPTIONS)[number],
    );
    const mEl = minutesRef.current?.children[Math.max(0, mIndex)] as
      HTMLElement | undefined;
    mEl?.scrollIntoView({ block: "center" });
  }, [hours, minutes]);

  const total = hours * 60 + minutes;
  const invalid = total === 0;

  return (
    <div className="stack gap" role="group" aria-labelledby={labelId}>
      <span id={labelId}>{label}</span>
      <div className="row gap duration-wheel" dir="rtl">
        <div className="stack tight grow">
          <span className="muted">שעות</span>
          <div
            ref={hoursRef}
            className="duration-wheel-col"
            tabIndex={0}
            aria-label="שעות"
            onKeyDown={(e) => {
              if (e.key === "ArrowUp")
                onChange({ hours: Math.min(12, hours + 1), minutes });
              if (e.key === "ArrowDown")
                onChange({ hours: Math.max(0, hours - 1), minutes });
            }}
          >
            {Array.from({ length: 13 }, (_, h) => (
              <button
                key={h}
                type="button"
                className={h === hours ? "active" : ""}
                onClick={() => onChange({ hours: h, minutes })}
              >
                {h}
              </button>
            ))}
          </div>
        </div>
        <div className="stack tight grow">
          <span className="muted">דקות</span>
          <div
            ref={minutesRef}
            className="duration-wheel-col"
            tabIndex={0}
            aria-label="דקות"
            onKeyDown={(e) => {
              const idx = MINUTE_OPTIONS.indexOf(
                minutes as (typeof MINUTE_OPTIONS)[number],
              );
              if (e.key === "ArrowUp")
                onChange({
                  hours,
                  minutes: MINUTE_OPTIONS[Math.min(11, Math.max(0, idx) + 1)],
                });
              if (e.key === "ArrowDown")
                onChange({
                  hours,
                  minutes: MINUTE_OPTIONS[Math.max(0, (idx < 0 ? 0 : idx) - 1)],
                });
            }}
          >
            {MINUTE_OPTIONS.map((m) => (
              <button
                key={m}
                type="button"
                className={m === minutes ? "active" : ""}
                onClick={() => onChange({ hours, minutes: m })}
              >
                {String(m).padStart(2, "0")}
              </button>
            ))}
          </div>
        </div>
      </div>
      {invalid ? (
        <p className="error" role="alert">
          צריך לבחור לפחות 5 דקות.
        </p>
      ) : (
        <p className="muted">
          {hours} שעות ו־{String(minutes).padStart(2, "0")} דקות
        </p>
      )}
    </div>
  );
}

export function durationToMinutes(hours: number, minutes: number) {
  return hours * 60 + minutes;
}
