import { Bell } from "lucide-react";
import { Action, AppState, Task } from "@/lib/model";
import { ViewHeader } from "@/components/view-header";
import { TaskCard } from "@/components/task-card";
import { Empty } from "@/components/empty-state";
import type { FocusController } from "@/hooks/use-focus-controller";

function tasksByIds(state: AppState, ids: string[]): Task[] {
  const byId = new Map(state.tasks.map((task) => [task.id, task]));
  return ids
    .map((id) => byId.get(id))
    .filter((task): task is Task => Boolean(task));
}

export function FocusView(props: {
  state: AppState;
  busy: boolean;
  clock: Date;
  detailed: boolean;
  focus: FocusController;
  onEdit: (t: Task) => void;
  onChat: (t: Task) => void;
  onComplete: (t: Task) => void;
  onAction: (a: Action) => Promise<void>;
}) {
  const selected = tasksByIds(props.state, props.focus.taskIds);
  const dueReminders = props.state.reminders.filter(
    (r) => r.status === "pending" && new Date(r.dueAt) <= props.clock,
  );
  return (
    <>
      <ViewHeader view="focus" />
      <p className="intro">
        מה עלול ליפול בין הכיסאות — לא רשימת ניקיון יומיומית. נבדוק בעדינות, בלי
        להניח שלא נעשה.
      </p>
      {props.focus.status === "loading" && (
        <p className="intro" role="status" aria-live="polite">
          הסוכן בודק מה חשוב עכשיו…
        </p>
      )}
      {props.focus.status === "error" && (
        <div className="callout" role="alert">
          <Bell size={20} />
          <div>
            <strong>הסוכן לא זמין כרגע</strong>
            <p>{props.focus.error || "אפשר לנסות שוב."}</p>
            <button
              type="button"
              className="text-button"
              onClick={props.focus.retry}
            >
              נסה שוב
            </button>
          </div>
        </div>
      )}
      {props.focus.status === "ready" && props.focus.reply ? (
        <p className="intro">{props.focus.reply}</p>
      ) : null}
      {dueReminders.map((r) => (
        <div className="callout" key={r.id}>
          <Bell size={20} />
          <span>{r.title} · הגיע הזמן לבדוק</span>
        </div>
      ))}
      <div className="task-list">
        {selected.map((t) => (
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
      {props.focus.status === "ready" && !selected.length && (
        <Empty text="אין כרגע משהו נוסף שהסוכן רוצה להציף." />
      )}
    </>
  );
}
