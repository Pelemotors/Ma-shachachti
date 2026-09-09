"use client";
import { DurationWheel, durationToMinutes } from "@/components/duration-wheel";
import { VoiceButton } from "@/components/voice-recorder";

export function PlanSetupView(props: {
  planHours: number;
  planMinsPart: number;
  effort: number;
  changedDay: string;
  planBusy: boolean;
  mode: string;
  aiConsent: boolean;
  compact?: boolean;
  selectedDateIsToday?: boolean;
  onDuration: (v: { hours: number; minutes: number }) => void;
  onEffort: (v: number) => void;
  onChangedDay: (v: string) => void;
  onChangedDaySubmit: () => void;
  onNeedConsent: () => void;
  onError: (msg: string) => void;
}) {
  const voiceEnabled = props.mode === "cloud" && !props.planBusy;
  return (
    <section
      className={props.compact ? "panel stack schedule-adjust" : "panel stack"}
    >
      <h3 className="schedule-adjust-title">
        {props.selectedDateIsToday === false
          ? "מה שונה ביום הזה?"
          : "מה שונה היום?"}
      </h3>
      <p className="muted schedule-adjust-hint">
        אפשר לכתוב חופשי — זה אותו סוכן אישי, לא טופס תכנון בלבד.
      </p>
      <label>
        {props.selectedDateIsToday === false ? "מה השתנה ביום הזה" : "מה השתנה"}
        <textarea
          value={props.changedDay}
          onChange={(e) => props.onChangedDay(e.target.value)}
          placeholder="למשל: אני יוצאת ב־16:00, אין לי כוח, הילדה בבית, יש לי רק שעה בבוקר..."
          rows={2}
        />
      </label>
      <details className="schedule-adjust-more">
        <summary>כמה זמן וכוח יש לי היום?</summary>
        <DurationWheel
          hours={props.planHours}
          minutes={props.planMinsPart}
          label="כמה זמן יש לי היום?"
          onChange={props.onDuration}
        />
        <label>
          הכוח שלך היום
          <select
            value={props.effort}
            onChange={(e) => props.onEffort(+e.target.value)}
          >
            <option value={1}>מעט</option>
            <option value={2}>בינוני</option>
            <option value={3}>הרבה</option>
          </select>
        </label>
      </details>
      <div className="button-row">
        <VoiceButton
          enabled={voiceEnabled}
          aiConsent={props.aiConsent}
          onNeedConsent={props.onNeedConsent}
          disabledHint={
            props.mode !== "cloud"
              ? "תמלול קולי זמין אחרי חיבור לחשבון. אפשר להקליד כאן."
              : "תמלול קולי זמין אחרי הפעלת עזרה אישית. אפשר להקליד כאן."
          }
          onText={(text) =>
            props.onChangedDay(
              props.changedDay
                ? `${props.changedDay.trim()} ${text}`.trim()
                : text,
            )
          }
          onError={props.onError}
        />
        <button
          className="secondary"
          type="button"
          disabled={!props.changedDay.trim() || props.planBusy}
          onClick={() => void props.onChangedDaySubmit()}
        >
          עדכון היום
        </button>
      </div>
      {durationToMinutes(props.planHours, props.planMinsPart) === 0 ? (
        <p className="muted">כדי לבנות או להתאים לו״ז צריך לבחור כמה זמן יש.</p>
      ) : null}
    </section>
  );
}
