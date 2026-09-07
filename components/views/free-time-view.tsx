import { Bell } from "lucide-react";
import { Action, AppState, Task } from "@/lib/model";
import { DurationWheel } from "@/components/duration-wheel";
import { ViewHeader } from "@/components/view-header";
import { TaskCard } from "@/components/task-card";
import { Empty } from "@/components/empty-state";

export function FreeTimeView(props: {
  state: AppState;
  busy: boolean;
  clock: Date;
  detailed: boolean;
  freeHours: number;
  freeMinsPart: number;
  effort: number;
  closeFirst: Task[];
  outsidePlan: Task[];
  importantTitles: string[];
  onDuration: (v: { hours: number; minutes: number }) => void;
  onEffort: (v: number) => void;
  onEdit: (t: Task) => void;
  onChat: (t: Task) => void;
  onComplete: (t: Task) => void;
  onAction: (a: Action) => Promise<void>;
}) {
  return (
    <>
      <ViewHeader view="free" />
      <p className="intro">זמן הזדמנות — לא העתק של לו״ז היום.</p>
      <section className="panel stack">
        <DurationWheel
          hours={props.freeHours}
          minutes={props.freeMinsPart}
          label="כמה זמן פנוי יש?"
          onChange={props.onDuration}
        />
        <label>
          כמה כוח מתאים להשקיע?
          <select
            value={props.effort}
            onChange={(e) => props.onEffort(+e.target.value)}
          >
            <option value={1}>מעט, משהו קל</option>
            <option value={2}>כוח בינוני</option>
            <option value={3}>אפשר גם משהו מאומץ</option>
          </select>
        </label>
      </section>
      {props.importantTitles.length > 0 && (
        <div className="callout">
          <Bell size={20} />
          <div>
            <strong>חשוב לזכור, גם אם לא נכנס עכשיו</strong>
            <p>{props.importantTitles.join(" · ")}</p>
          </div>
        </div>
      )}
      <div className="section-heading">
        <h2>כדאי לסגור קודם</h2>
      </div>
      <div className="task-list">
        {props.closeFirst.map((t) => (
          <TaskCard
            state={props.state}
            busy={props.busy}
            clock={props.clock}
            detailed={props.detailed}
            onEdit={props.onEdit}
            onChat={props.onChat}
            onComplete={props.onComplete}
            onAction={props.onAction}
            key={t.id}
            task={t}
          />
        ))}
      </div>
      {!props.closeFirst.length && (
        <Empty text="אין דברים דחופים שנכנסים לחלון הזה." />
      )}
      <div className="section-heading">
        <h2>משהו שלא נכנס היום</h2>
      </div>
      <div className="task-list">
        {props.outsidePlan.map((t) => (
          <TaskCard
            state={props.state}
            busy={props.busy}
            clock={props.clock}
            detailed={props.detailed}
            onEdit={props.onEdit}
            onChat={props.onChat}
            onComplete={props.onComplete}
            onAction={props.onAction}
            key={t.id}
            task={t}
          />
        ))}
      </div>
      {!props.outsidePlan.length && (
        <Empty text="אין הצעות נוספות מחוץ ללו״ז כרגע." />
      )}
    </>
  );
}
