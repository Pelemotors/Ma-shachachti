"use client";

import { FIXED_TIME_LABEL } from "@/lib/schedule";
import { formatClockRange } from "@/lib/time";
import type { ClientPresentation } from "@/lib/types";

type Plan = Extract<ClientPresentation, { type: "schedule_plan" }>;

export function SchedulePlanCard(props: {
  plan: Plan;
  saving?: boolean;
  optimistic?: boolean;
  onToggle: (id: string, done: boolean) => void;
  onSave?: () => void;
}) {
  return (
    <div className="schedule-plan">
      <p className="schedule-plan-kicker">
        {props.optimistic
          ? "שומר…"
          : props.plan.saved
            ? "נשמר ללוז"
            : "תוכנית מוצעת"}
      </p>
      <ul className="schedule-plan-list">
        {props.plan.items.map((item) => {
          const done = item.status !== "open" && item.status !== "proposed";
          const key = item.task_id ?? `${item.title}-${item.planned_start}`;
          return (
            <li key={key} className={done ? "done" : undefined}>
              {item.task_id ? (
                <button
                  className={`task-check${done ? " checked" : ""}`}
                  type="button"
                  aria-label={item.title}
                  disabled={props.saving}
                  onClick={() => props.onToggle(item.task_id as string, done)}
                />
              ) : (
                <span className="task-check proposed" aria-hidden="true" />
              )}
              <div className="task-copy">
                <small className="schedule-time">
                  {formatClockRange(item.planned_start, item.planned_end)}
                </small>
                <span>{item.title}</span>
                {item.fixed ? <em>{FIXED_TIME_LABEL}</em> : null}
              </div>
            </li>
          );
        })}
      </ul>
      {!props.plan.saved && props.onSave ? (
        <button
          className="settings-action"
          type="button"
          disabled={props.saving}
          onClick={props.onSave}
        >
          שמור ללוז שלי
        </button>
      ) : null}
    </div>
  );
}
