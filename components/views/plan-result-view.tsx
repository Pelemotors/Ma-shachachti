import { Action, AppState, Task } from "@/lib/model";
import { ViewHeader } from "@/components/view-header";
import { TaskCard } from "@/components/task-card";
import { Empty } from "@/components/empty-state";

export function PlanResultView(props: {
  state: AppState;
  busy: boolean;
  clock: Date;
  detailed: boolean;
  persistedPlan: NonNullable<AppState["planning"]["plan"]> | null;
  planReady: boolean;
  planPhase: "setup" | "result";
  fallbackSelected: {
    task: Task;
    start: number;
    end: number;
  }[];
  onEdit: (t: Task) => void;
  onChat: (t: Task) => void;
  onComplete: (t: Task) => void;
  onAction: (a: Action) => Promise<void>;
  onRebuild: () => void;
}) {
  return (
    <>
      <ViewHeader view="plan" />
      <p className="muted">
        תוכנית שמורה להיום
        {props.persistedPlan
          ? ` · ${props.persistedPlan.items.length} פריטים`
          : ""}
        .
      </p>
      <div className="timeline">
        {(props.persistedPlan?.items ?? []).map((item, i) => {
          const task = props.state.tasks.find((t) => t.id === item.taskId);
          if (!task) return null;
          return (
            <div className="timeline-item" key={item.taskId}>
              <div className="timeline-number">{i + 1}</div>
              <div>
                <small>
                  {item.planStatus}
                  {item.locked ? " · נעול" : ""}
                </small>
                <TaskCard
                  state={props.state}
                  busy={props.busy}
                  clock={props.clock}
                  detailed={props.detailed}
                  onEdit={props.onEdit}
                  onChat={props.onChat}
                  onComplete={props.onComplete}
                  onAction={props.onAction}
                  task={task}
                />
              </div>
            </div>
          );
        })}
      </div>
      {!props.persistedPlan?.items.length && (
        <Empty text="אין כרגע משימות בתוכנית השמורה." />
      )}
      <button className="secondary" onClick={props.onRebuild}>
        לבנות תוכנית מחדש
      </button>
      <button className="secondary" onClick={() => window.print()}>
        הדפסת התוכנית / שמירה כ־PDF
      </button>
      {!props.persistedPlan &&
        props.planReady &&
        props.planPhase === "result" && (
          <div className="timeline">
            {props.fallbackSelected.map(({ task, start, end }, i) => (
              <div className="timeline-item" key={task.id}>
                <div className="timeline-number">{i + 1}</div>
                <div>
                  <small>
                    דקה {start}–{end} מההתחלה
                  </small>
                  <TaskCard
                    state={props.state}
                    busy={props.busy}
                    clock={props.clock}
                    detailed={props.detailed}
                    onEdit={props.onEdit}
                    onChat={props.onChat}
                    onComplete={props.onComplete}
                    onAction={props.onAction}
                    task={task}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
    </>
  );
}
