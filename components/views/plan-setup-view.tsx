"use client";
import { DurationWheel, durationToMinutes } from "@/components/duration-wheel";
import { ViewHeader } from "@/components/view-header";
import { VoiceButton } from "@/components/voice-recorder";

export function PlanSetupView(props: {
  planHours: number;
  planMinsPart: number;
  effort: number;
  changedDay: string;
  planBusy: boolean;
  mode: string;
  aiConsent: boolean;
  onDuration: (v: { hours: number; minutes: number }) => void;
  onEffort: (v: number) => void;
  onChangedDay: (v: string) => void;
  onBuild: () => void;
  onChangedDaySubmit: () => void;
  onNeedConsent: () => void;
  onError: (msg: string) => void;
}) {
  const voiceEnabled = props.mode === "cloud" && !props.planBusy;
  return (
    <>
      <ViewHeader view="plan" />
      <p className="intro">תוכנית שמורה להיום — לא מחושבת מחדש בכל רענון.</p>
      <section className="panel stack">
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
        <button
          className="primary"
          disabled={
            durationToMinutes(props.planHours, props.planMinsPart) === 0
          }
          onClick={() => void props.onBuild()}
        >
          היום כרגיל — בנה תוכנית
        </button>

        <label>
          מה שונה היום?
          <textarea
            value={props.changedDay}
            onChange={(e) => props.onChangedDay(e.target.value)}
            placeholder="למשל: יש לי תור ב־16:00, הילדה בבית היום, בערב אני יוצאת..."
            rows={3}
          />
        </label>
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
            המשך
          </button>
        </div>
      </section>
    </>
  );
}
