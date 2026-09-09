"use client";
import { Check } from "lucide-react";
import type { Action, AppState, Task } from "@/lib/model";
import { shouldAskWorkTime } from "@/lib/engine";
import { emojiForTask } from "@/lib/task-emoji";
import type { DayPart } from "@/lib/domain/planning/schedule-day";

export function ScheduleItemRow(props: {
  task: Task;
  state: AppState;
  busy: boolean;
  timeLabel: string | null;
  timeInput: string;
  selectedDate: string;
  onEdit: (t: Task) => void;
  onComplete: (t: Task) => void;
  onAction: (a: Action) => Promise<void>;
  onDefer: (taskId: string) => Promise<void>;
  onChangeTime: (taskId: string, hhmm: string) => Promise<void>;
  onMoveDayPart: (
    taskId: string,
    part: Exclude<DayPart, "unscheduled">,
  ) => Promise<void>;
  onMoveToDate: (taskId: string, dateKey: string) => Promise<void>;
  onRemoveFromPlan: (taskId: string) => Promise<void>;
}) {
  const t = props.task;
  const isDone = t.status === "done";
  const completeOrToggle = () =>
    isDone
      ? void props.onAction({ type: "task.status", id: t.id, status: "open" })
      : shouldAskWorkTime(t, props.state)
        ? props.onComplete(t)
        : void props.onAction({
            type: "task.status",
            id: t.id,
            status: "done",
          });

  return (
    <article className={"schedule-row" + (isDone ? " is-done" : "")}>
      <div className="schedule-row-main">
        <button
          className="task-check"
          aria-label={
            isDone ? "החזרת " + t.title + " לרשימה" : "סיום " + t.title
          }
          disabled={props.busy}
          onClick={completeOrToggle}
        >
          {isDone && <Check size={14} />}
        </button>
        {props.timeLabel ? (
          <span className="schedule-row-time">{props.timeLabel}</span>
        ) : (
          <span className="schedule-row-time is-empty" aria-hidden="true">
            —
          </span>
        )}
        <span className="task-emoji" aria-hidden="true">
          {emojiForTask(t.title, t.categoryId)}
        </span>
        <button
          className="task-title"
          type="button"
          onClick={() => props.onEdit(t)}
        >
          <strong>{t.title}</strong>
        </button>
      </div>
      {!isDone && t.status !== "cancelled" ? (
        <details className="schedule-row-actions">
          <summary>פעולות</summary>
          <div className="schedule-row-tools">
            <button
              type="button"
              disabled={props.busy}
              onClick={() => void props.onDefer(t.id)}
            >
              דחייה
            </button>
            <button type="button" onClick={() => props.onEdit(t)}>
              עריכה
            </button>
            <label>
              שעה
              <input
                type="time"
                defaultValue={props.timeInput}
                disabled={props.busy}
                onChange={(e) => {
                  if (e.target.value)
                    void props.onChangeTime(t.id, e.target.value);
                }}
              />
            </label>
            <label>
              חלק ביום
              <select
                defaultValue=""
                disabled={props.busy}
                onChange={(e) => {
                  const value = e.target.value as Exclude<
                    DayPart,
                    "unscheduled"
                  >;
                  if (value) void props.onMoveDayPart(t.id, value);
                  e.target.value = "";
                }}
              >
                <option value="" disabled>
                  בחירה
                </option>
                <option value="morning">בוקר</option>
                <option value="afternoon">צהריים</option>
                <option value="evening">ערב</option>
              </select>
            </label>
            <label>
              העברה ליום
              <input
                type="date"
                defaultValue={props.selectedDate}
                disabled={props.busy}
                onChange={(e) => {
                  if (e.target.value)
                    void props.onMoveToDate(t.id, e.target.value);
                }}
              />
            </label>
            <button
              type="button"
              disabled={props.busy}
              onClick={() => void props.onRemoveFromPlan(t.id)}
            >
              הסרה מהלו״ז
            </button>
          </div>
        </details>
      ) : null}
    </article>
  );
}
