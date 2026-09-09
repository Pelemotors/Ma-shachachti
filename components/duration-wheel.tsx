"use client";

const MINUTE_OPTIONS = [0, 15, 30, 45] as const;
const HOUR_OPTIONS = [
  { value: 0, label: "0" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" },
  { value: 6, label: "6+" },
] as const;

const PRESETS = [
  { label: "15 דק׳", hours: 0, minutes: 15 },
  { label: "30 דק׳", hours: 0, minutes: 30 },
  { label: "45 דק׳", hours: 0, minutes: 45 },
  { label: "שעה", hours: 1, minutes: 0 },
  { label: "שעה וחצי", hours: 1, minutes: 30 },
  { label: "שעתיים", hours: 2, minutes: 0 },
] as const;

export function durationToMinutes(hours: number, minutes: number) {
  return hours * 60 + minutes;
}

function formatDurationHebrew(hours: number, minutes: number) {
  if (hours === 0 && minutes === 0) return "בחרו משך זמן";
  if (hours === 0) return `${minutes} דקות`;
  if (minutes === 0) {
    if (hours === 1) return "שעה";
    if (hours === 2) return "שעתיים";
    return `${hours} שעות`;
  }
  const hourPart =
    hours === 1 ? "שעה" : hours === 2 ? "שעתיים" : `${hours} שעות`;
  return `${hourPart} ו־${String(minutes).padStart(2, "0")} דקות`;
}

function matchesPreset(
  hours: number,
  minutes: number,
  preset: (typeof PRESETS)[number],
) {
  return hours === preset.hours && minutes === preset.minutes;
}

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
  const total = durationToMinutes(hours, minutes);
  const invalid = total === 0;
  const activePreset = PRESETS.find((preset) =>
    matchesPreset(hours, minutes, preset),
  );

  return (
    <div className="duration-picker stack gap" role="group" aria-label={label}>
      <span className="duration-picker__label">{label}</span>
      <p
        className={
          "duration-picker__summary" + (invalid ? " duration-picker__summary--empty" : "")
        }
        aria-live="polite"
      >
        {formatDurationHebrew(hours, minutes)}
      </p>

      <div className="duration-picker__presets" role="listbox" aria-label="משכים נפוצים">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            role="option"
            aria-selected={activePreset?.label === preset.label}
            className={
              activePreset?.label === preset.label
                ? "duration-picker__chip selected"
                : "duration-picker__chip"
            }
            onClick={() =>
              onChange({ hours: preset.hours, minutes: preset.minutes })
            }
          >
            {preset.label}
          </button>
        ))}
      </div>

      <details className="duration-picker__custom">
        <summary>משך אחר</summary>
        <div className="duration-picker__custom-body stack gap">
          <div className="stack tight">
            <span className="muted">שעות</span>
            <div className="duration-picker__chips" role="listbox" aria-label="שעות">
              {HOUR_OPTIONS.map((h) => (
                <button
                  key={h.value}
                  type="button"
                  role="option"
                  aria-selected={h.value === hours}
                  className={
                    h.value === hours
                      ? "duration-picker__chip selected"
                      : "duration-picker__chip"
                  }
                  onClick={() => onChange({ hours: h.value, minutes })}
                >
                  {h.label}
                </button>
              ))}
            </div>
          </div>
          <div className="stack tight">
            <span className="muted">דקות</span>
            <div className="duration-picker__chips" role="listbox" aria-label="דקות">
              {MINUTE_OPTIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="option"
                  aria-selected={m === minutes}
                  className={
                    m === minutes
                      ? "duration-picker__chip selected"
                      : "duration-picker__chip"
                  }
                  onClick={() => onChange({ hours, minutes: m })}
                >
                  {String(m).padStart(2, "0")}
                </button>
              ))}
            </div>
          </div>
        </div>
      </details>

      {invalid && (
        <p className="error" role="alert">
          צריך לבחור לפחות 5 דקות.
        </p>
      )}
    </div>
  );
}
