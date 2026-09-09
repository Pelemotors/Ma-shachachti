import { Bell } from "lucide-react";
import { Action, AppState, Task } from "@/lib/model";
import { DurationWheel } from "@/components/duration-wheel";
import { ViewHeader } from "@/components/view-header";
import { TaskCard } from "@/components/task-card";
import { Empty } from "@/components/empty-state";
import type { FreeTimeController } from "@/hooks/use-free-time-controller";

function tasksByIds(state: AppState, ids: string[]): Task[] {
  const byId = new Map(state.tasks.map((task) => [task.id, task]));
  return ids
    .map((id) => byId.get(id))
    .filter((task): task is Task => Boolean(task));
}

export function FreeTimeView(props: {
  state: AppState;
  busy: boolean;
  clock: Date;
  detailed: boolean;
  free: FreeTimeController;
  onEdit: (t: Task) => void;
  onChat: (t: Task) => void;
  onComplete: (t: Task) => void;
  onAction: (a: Action) => Promise<void>;
}) {
  const selected = tasksByIds(props.state, props.free.taskIds);
  const loading = props.free.status === "loading";
  return (
    <>
      <ViewHeader view="free" />
      <p className="intro">זמן הזדמנות — לא העתק של לו״ז היום.</p>
      <section className="panel stack">
        <DurationWheel
          hours={props.free.freeHours}
          minutes={props.free.freeMinsPart}
          label="כמה זמן פנוי יש?"
          onChange={props.free.onDuration}
        />
        <label>
          כמה כוח מתאים להשקיע?
          <select
            value={props.free.effort}
            onChange={(e) => props.free.setEffort(+e.target.value)}
          >
            <option value={1}>מעט, משהו קל</option>
            <option value={2}>כוח בינוני</option>
            <option value={3}>אפשר גם משהו מאומץ</option>
          </select>
        </label>
        <button
          type="button"
          className="text-button"
          disabled={loading || props.busy}
          onClick={props.free.askAgent}
        >
          מה מתאים לזמן הזה
        </button>
      </section>
      {loading && (
        <p className="intro" role="status" aria-live="polite">
          הסוכן בודק מה מתאים עכשיו…
        </p>
      )}
      {props.free.status === "error" && (
        <div className="callout" role="alert">
          <Bell size={20} />
          <div>
            <strong>הסוכן לא זמין כרגע</strong>
            <p>{props.free.error || "אפשר לנסות שוב."}</p>
            <button
              type="button"
              className="text-button"
              onClick={props.free.askAgent}
            >
              נסה שוב
            </button>
          </div>
        </div>
      )}
      {props.free.status === "ready" && props.free.reply ? (
        <p className="intro">{props.free.reply}</p>
      ) : null}
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
      {props.free.status === "ready" && !selected.length && (
        <Empty text="הסוכן לא בחר משימות להצגה לחלון הזה." />
      )}
      {props.free.status === "idle" && (
        <Empty text="בחרו זמן וכוח, ואז בקשו מהסוכן מה מתאים עכשיו." />
      )}
    </>
  );
}
