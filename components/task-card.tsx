"use client";
import { Check, Clock3, MessageCircle } from "lucide-react";
import type { Action, AppState, Task } from "@/lib/model";
import { categoryLabel } from "@/lib/taxonomy";
import { estimatedMinutes, shouldAskWorkTime, blocked } from "@/lib/engine";
import { formatTime } from "@/lib/time";

export function TaskCard({
  task: t,
  state,
  busy,
  clock,
  detailed,
  onEdit,
  onChat,
  onComplete,
  onAction,
  highlight = null,
}: {
  task: Task;
  state: AppState;
  busy: boolean;
  clock: Date;
  detailed: boolean;
  onEdit: (t: Task) => void;
  onChat: (t: Task) => void;
  onComplete: (t: Task) => void;
  onAction: (a: Action) => Promise<void>;
  highlight?: "urgent" | "important" | null;
}) {
  const isDone = t.status === "done";
  const mark =
    highlight === "urgent" ? " דחוף" : highlight === "important" ? " חשוב" : "";
  return (
    <article
      className={
        "task-card " +
        (isDone ? "is-done " : "") +
        (highlight === "urgent"
          ? "is-urgent "
          : highlight === "important"
            ? "is-important "
            : "")
      }
    >
      <div className="task-top">
        <button
          className="task-check"
          aria-label={
            isDone ? "החזרת " + t.title + " לרשימה" : "סיום " + t.title
          }
          disabled={busy}
          onClick={() =>
            isDone
              ? void onAction({ type: "task.status", id: t.id, status: "open" })
              : shouldAskWorkTime(t, state)
                ? onComplete(t)
                : void onAction({
                    type: "task.status",
                    id: t.id,
                    status: "done",
                  })
          }
        >
          {isDone && <Check size={17} />}
        </button>
        <button className="task-title" onClick={() => onEdit(t)}>
          <strong>
            {t.title}
            {mark ? (
              <span className="tag" style={{ marginInlineStart: 8 }}>
                {mark.trim()}
              </span>
            ) : null}
          </strong>
          <span>
            {t.kind === "idea" ? "רעיון, אם יתאים · " : ""}
            {categoryLabel(t.categoryId)} · {estimatedMinutes(t, state)} דק׳
            {t.waitMinutes > 0 ? ` + ${t.waitMinutes} דק׳ המתנה` : ""}
          </span>
        </button>
        <button
          className="icon-button"
          aria-label={"שיחה על " + t.title}
          onClick={() => onChat(t)}
        >
          <MessageCircle size={18} />
        </button>
      </div>
      {t.dueAt && (
        <p
          className={
            "task-meta " +
            (new Date(t.dueAt) < clock && !isDone ? "attention" : "")
          }
        >
          <Clock3 size={14} />
          {formatTime(t.dueAt, state.profile.timezone)}
          {!isDone && new Date(t.dueAt) < clock
            ? " · המועד חלף, כדאי לבדוק אם בוצע"
            : ""}
        </p>
      )}
      {t.hiddenUntil && new Date(t.hiddenUntil) > clock && (
        <p className="task-meta">
          ממתינה להמשך · {formatTime(t.hiddenUntil, state.profile.timezone)}
        </p>
      )}
      {t.status === "unknown" && (
        <p className="task-meta">לא ידוע אם כבר בוצע</p>
      )}
      {blocked(t, state) && (
        <p className="task-meta">
          קודם:{" "}
          {t.dependsOn
            .map((id) => state.tasks.find((x) => x.id === id))
            .filter((x) => x?.status !== "done")
            .map((x) => x?.title)
            .join(", ")}
        </p>
      )}
      {detailed && (
        <>
          <div className="task-steps">
            {t.steps.map((step) => (
              <label className="check-line" key={step.id}>
                <input
                  type="checkbox"
                  checked={step.done}
                  disabled={busy}
                  onChange={(e) =>
                    void onAction({
                      type: "task.step",
                      id: t.id,
                      stepId: step.id,
                      done: e.target.checked,
                    })
                  }
                />
                {step.title}
              </label>
            ))}
          </div>
          {t.notes && <p className="task-meta">{t.notes}</p>}
        </>
      )}
      {!isDone && t.status !== "cancelled" && (
        <div className="task-actions">
          <button
            disabled={busy}
            onClick={() => void onAction({ type: "task.defer", id: t.id })}
          >
            לא היום
          </button>
          <button onClick={() => onEdit(t)}>שינוי</button>
          {detailed && (
            <button
              disabled={busy}
              onClick={() =>
                void onAction({
                  type: "task.status",
                  id: t.id,
                  status: "cancelled",
                })
              }
            >
              ביטול משימה
            </button>
          )}
        </div>
      )}
    </article>
  );
}
