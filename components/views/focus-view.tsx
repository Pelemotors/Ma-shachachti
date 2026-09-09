import { Bell } from "lucide-react";
import { Action, AppState, Task } from "@/lib/model";
import { followUps } from "@/lib/engine";
import { ViewHeader } from "@/components/view-header";
import { TaskCard } from "@/components/task-card";
import { Empty } from "@/components/empty-state";

function overdueOrUnknownTasks(state: AppState, clock: Date): Task[] {
  const nowMs = clock.getTime();
  return state.tasks
    .filter(
      (t) =>
        t.status === "open" ||
        t.status === "unknown" ||
        t.status === "in_progress",
    )
    .filter(
      (t) =>
        t.status === "unknown" ||
        (Boolean(t.dueAt) && Date.parse(t.dueAt!) < nowMs),
    )
    .sort((a, b) => {
      if (!a.dueAt && !b.dueAt) return 0;
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return Date.parse(a.dueAt) - Date.parse(b.dueAt);
    });
}

export function FocusView(props: {
  state: AppState;
  busy: boolean;
  clock: Date;
  detailed: boolean;
  onEdit: (t: Task) => void;
  onChat: (t: Task) => void;
  onComplete: (t: Task) => void;
  onAction: (a: Action) => Promise<void>;
}) {
  const relevant = overdueOrUnknownTasks(props.state, props.clock);
  const followup = followUps(props.state, props.clock);
  return (
    <>
      <ViewHeader view="focus" />
      <p className="intro">
        מה עלול ליפול בין הכיסאות — לא רשימת ניקיון יומיומית. נבדוק בעדינות, בלי
        להניח שלא נעשה.
      </p>
      {followup.length > 0 && (
        <div className="callout">
          <Bell size={20} />
          <div>
            <strong>יש משהו שכדאי לבדוק</strong>
            <p>{followup.map((t) => t.title).join(" · ")}</p>
          </div>
        </div>
      )}
      <div className="task-list">
        {relevant.map((t) => (
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
            highlight={
              t.priority >= 3 ? "urgent" : t.priority >= 2 ? "important" : null
            }
          />
        ))}
      </div>
      {!relevant.length && (
        <Empty text="אין כרגע משהו נוסף שדורש את תשומת הלב שלך." />
      )}
      {props.state.reminders
        .filter(
          (r) => r.status === "pending" && new Date(r.dueAt) <= props.clock,
        )
        .map((r) => (
          <div className="callout" key={r.id}>
            <Bell size={20} />
            <span>{r.title} · הגיע הזמן לבדוק</span>
          </div>
        ))}
    </>
  );
}
