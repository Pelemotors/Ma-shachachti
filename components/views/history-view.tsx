import { Action, AppState, Task } from "@/lib/model";
import { ViewHeader } from "@/components/view-header";
import { TaskCard } from "@/components/task-card";
import { Empty } from "@/components/empty-state";

export function HistoryView(props: {
  state: AppState;
  busy: boolean;
  clock: Date;
  detailed: boolean;
  onEdit: (t: Task) => void;
  onChat: (t: Task) => void;
  onComplete: (t: Task) => void;
  onAction: (a: Action) => Promise<void>;
}) {
  const completed = props.state.tasks.filter((t) => t.status === "done");
  return (
    <>
      <ViewHeader view="history" />
      <p className="intro">
        הביצועים נשמרים כאן. אין צורך לזכור לדווח על הכול.
      </p>
      <div className="task-list">
        {props.state.tasks
          .filter((t) => ["done", "cancelled"].includes(t.status))
          .slice()
          .reverse()
          .map((t) => (
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
      {!completed.length &&
        !props.state.tasks.some((t) => t.status === "cancelled") && (
          <Empty text="כאן יופיעו משימות שהושלמו או בוטלו." />
        )}
    </>
  );
}
