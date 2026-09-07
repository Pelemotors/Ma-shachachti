import { DurationWheel, durationToMinutes } from "@/components/duration-wheel";
import { ViewHeader } from "@/components/view-header";

export function PlanSetupView(props: {
  planHours: number;
  planMinsPart: number;
  effort: number;
  changedDay: string;
  planBusy: boolean;
  mode: string;
  onDuration: (v: { hours: number; minutes: number }) => void;
  onEffort: (v: number) => void;
  onChangedDay: (v: string) => void;
  onBuild: () => void;
  onChangedDaySubmit: () => void;
}) {
  return (
    <>
      <ViewHeader view="plan" />
      <p className="intro">תוכנית שמורה להיום — לא מחושבת מחדש בכל רענון.</p>
      <section className="panel stack">
        <DurationWheel
          hours={props.planHours}
          minutes={props.planMinsPart}
          label="כמה זמן פנוי לבניית הלו״ז?"
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
        <details>
          <summary>יש משהו שונה היום</summary>
          <label>
            מה השתנה?
            <textarea
              value={props.changedDay}
              onChange={(e) => props.onChangedDay(e.target.value)}
              placeholder="למשל: יש תור בצהריים, אני לבד עם הילדים"
            />
          </label>
          <button
            className="secondary"
            disabled={
              !props.changedDay.trim() ||
              props.planBusy ||
              props.mode === "local"
            }
            onClick={() => void props.onChangedDaySubmit()}
          >
            המשך
          </button>
        </details>
      </section>
    </>
  );
}
