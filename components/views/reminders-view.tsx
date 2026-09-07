import { AppState } from "@/lib/model";
import { formatTime } from "@/lib/time";
import { ViewHeader } from "@/components/view-header";

export function RemindersView(props: {
  state: AppState;
  busy: boolean;
  mode: string;
  pushEnabled: boolean;
  pushBusy: boolean;
  pushReady: boolean;
  reminderTitle: string;
  reminderDue: string;
  reminderUrgency: "urgent" | "medium" | "low";
  onTitle: (v: string) => void;
  onDue: (v: string) => void;
  onUrgency: (v: "urgent" | "medium" | "low") => void;
  onAdd: () => void;
  onEnablePush: () => void;
  onCancel: (id: string) => void;
}) {
  return (
    <>
      <ViewHeader view="reminders" />
      <p className="intro">
        {props.mode === "local"
          ? "התזכורות בהדגמה נשמרות במכשיר בלבד. אין שליחת התראות ברקע."
          : props.pushEnabled
            ? "המכשיר רשום להתראות. מסירה תלויה בחיבור ובשעות השקט. תזכורת דחופה יכולה לעבור גם בשעות השקט."
            : "התזכורות נשמרות ברשימה. כדי לקבל התראה צריך להפעיל התראות במכשיר."}
      </p>
      {props.mode === "cloud" && !props.pushEnabled && (
        <button
          className="secondary"
          disabled={props.pushBusy || !props.pushReady}
          onClick={() => void props.onEnablePush()}
        >
          {props.pushReady
            ? "הפעלת התראות במכשיר"
            : "שליחת התראות עדיין לא מחוברת"}
        </button>
      )}
      <form
        className="panel stack"
        onSubmit={(e) => {
          e.preventDefault();
          void props.onAdd();
        }}
      >
        <label>
          מה להזכיר?
          <input
            required
            maxLength={200}
            value={props.reminderTitle}
            onChange={(e) => props.onTitle(e.target.value)}
          />
        </label>
        <label>
          מתי? לפי השעה במכשיר
          <input
            type="datetime-local"
            required
            value={props.reminderDue}
            onChange={(e) => props.onDue(e.target.value)}
          />
        </label>
        <label>
          חשיבות ההתראה
          <select
            value={props.reminderUrgency}
            onChange={(e) =>
              props.onUrgency(e.target.value as typeof props.reminderUrgency)
            }
          >
            <option value="low">נמוכה — אפשר לחכות</option>
            <option value="medium">רגילה</option>
            <option value="urgent">דחופה — גם בשעות שקט</option>
          </select>
        </label>
        <button className="primary" disabled={props.busy}>
          שמירת תזכורת
        </button>
      </form>
      {props.state.reminders.map((r) => (
        <article className="list-row panel" key={r.id}>
          <div>
            <strong>{r.title}</strong>
            <p>
              {formatTime(r.dueAt, props.state.profile.timezone)} ·{" "}
              {r.urgency === "urgent"
                ? "דחופה · "
                : r.urgency === "low"
                  ? "חשיבות נמוכה · "
                  : ""}
              {
                {
                  pending: "ממתינה",
                  sent: "נשלחה לשירות ההתראות",
                  failed: "השליחה לא הצליחה",
                  cancelled: "בוטלה",
                }[r.status]
              }
            </p>
          </div>
          {r.status === "pending" && (
            <button onClick={() => props.onCancel(r.id)}>ביטול</button>
          )}
        </article>
      ))}
    </>
  );
}
