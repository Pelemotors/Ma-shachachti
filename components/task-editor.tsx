"use client";

import { FormEvent, useEffect, useState } from "react";
import { authFetch } from "@/lib/supabase-browser";
import type { TaskRow } from "@/lib/types";
import type { TaskSubtaskRow } from "@/lib/task-subtasks";
import { formatTaskWhen } from "@/lib/time";

type TaskEditorProps = {
  task: TaskRow;
  busy: boolean;
  onClose: () => void;
  onSave: (patch: Record<string, unknown>) => Promise<boolean>;
  onComplete: () => Promise<boolean>;
  onReopen: () => Promise<boolean>;
  onDelete: () => Promise<boolean>;
};

function toDateInput(value: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function toTimeInput(value: string | null): string {
  if (!value) return "";
  // due_at / planned are ISO; show Asia/Jerusalem clock roughly via local parse of HH:MM from ISO if Z
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jerusalem",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return "";
  }
}

export function TaskEditor(props: TaskEditorProps) {
  const { task, busy } = props;
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [dueDate, setDueDate] = useState(
    toDateInput(task.due_on ?? task.due_at),
  );
  const [dueTime, setDueTime] = useState(toTimeInput(task.due_at));
  const [subtasks, setSubtasks] = useState<TaskSubtaskRow[]>([]);
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [loadingSubs, setLoadingSubs] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setTitle(task.title);
    setNotes(task.notes ?? "");
    setDueDate(toDateInput(task.due_on ?? task.due_at));
    setDueTime(toTimeInput(task.due_at));
  }, [task]);

  useEffect(() => {
    let alive = true;
    setLoadingSubs(true);
    void authFetch(`/api/tasks/${task.id}/subtasks`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!alive) return;
        if (!response.ok || !Array.isArray(body.subtasks)) {
          setError("לא הצלחנו לטעון תתי־משימות.");
          return;
        }
        setSubtasks(body.subtasks as TaskSubtaskRow[]);
      })
      .catch(() => {
        if (alive) setError("לא הצלחנו לטעון תתי־משימות.");
      })
      .finally(() => {
        if (alive) setLoadingSubs(false);
      });
    return () => {
      alive = false;
    };
  }, [task.id]);

  async function mutateSubtask(body: Record<string, unknown>) {
    setError("");
    const response = await authFetch(`/api/tasks/${task.id}/subtasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!response) {
      setError("לא הצלחנו לעדכן תת־משימה.");
      return;
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(payload.subtasks)) {
      setError(
        typeof payload.error === "string"
          ? payload.error
          : "לא הצלחנו לעדכן תת־משימה.",
      );
      return;
    }
    setSubtasks(payload.subtasks as TaskSubtaskRow[]);
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) {
      setError("כותרת המשימה חובה.");
      return;
    }
    const patch: Record<string, unknown> = {
      type: "task.update",
      id: task.id,
      title: nextTitle,
      notes: notes.trim().slice(0, 2000),
    };
    if (!dueDate) {
      patch.due_patch = "clear";
    } else {
      patch.due_patch = "set";
      patch.due_on = dueDate;
      patch.due_time = dueTime || null;
    }
    const ok = await props.onSave(patch);
    if (ok) props.onClose();
  }

  return (
    <section className="task-editor" aria-labelledby="task-editor-title">
      <header className="task-editor__header">
        <h2 id="task-editor-title">עריכת משימה</h2>
        <button className="text-button" type="button" onClick={props.onClose}>
          סגור
        </button>
      </header>
      {formatTaskWhen(task) ? (
        <p className="muted">{formatTaskWhen(task)}</p>
      ) : null}
      <form className="task-editor__form" onSubmit={(e) => void handleSave(e)}>
        <label>
          <span>כותרת</span>
          <input
            value={title}
            maxLength={200}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="כותרת משימה"
          />
        </label>
        <label>
          <span>פרטים</span>
          <textarea
            value={notes}
            maxLength={2000}
            rows={3}
            disabled={busy}
            onChange={(e) => setNotes(e.target.value)}
            aria-label="פרטי משימה"
          />
        </label>
        <div className="task-editor__row">
          <label>
            <span>תאריך יעד</span>
            <input
              type="date"
              value={dueDate}
              disabled={busy}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </label>
          <label>
            <span>שעה</span>
            <input
              type="time"
              value={dueTime}
              disabled={busy || !dueDate}
              onChange={(e) => setDueTime(e.target.value)}
            />
          </label>
        </div>
        <div className="task-editor__actions">
          <button className="settings-action" type="submit" disabled={busy}>
            שמירה
          </button>
          {task.status === "open" ? (
            <button
              className="text-button"
              type="button"
              disabled={busy}
              onClick={() => void props.onComplete()}
            >
              סמן כבוצע
            </button>
          ) : (
            <button
              className="text-button"
              type="button"
              disabled={busy}
              onClick={() => void props.onReopen()}
            >
              פתח מחדש
            </button>
          )}
          <button
            className="text-button danger-text"
            type="button"
            disabled={busy}
            onClick={() => {
              if (!window.confirm("למחוק את המשימה?")) return;
              void props.onDelete().then((ok) => {
                if (ok) props.onClose();
              });
            }}
          >
            מחיקה
          </button>
        </div>
      </form>

      <div className="task-editor__subtasks">
        <h3>תתי־משימות</h3>
        {loadingSubs ? <p className="muted">טוען…</p> : null}
        <ul className="task-subtask-list">
          {subtasks.map((item) => (
            <li key={item.id} className={item.done ? "done" : undefined}>
              <button
                type="button"
                className={`task-check${item.done ? " checked" : ""}`}
                aria-label={item.done ? "בטל סימון" : "סמן כבוצע"}
                disabled={busy}
                onClick={() =>
                  void mutateSubtask({
                    action: "toggle",
                    id: item.id,
                    done: !item.done,
                  })
                }
              />
              <span>{item.title}</span>
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => {
                  const next = window.prompt("עריכת תת־משימה", item.title);
                  if (next == null) return;
                  const trimmed = next.trim();
                  if (!trimmed) return;
                  void mutateSubtask({
                    action: "update",
                    id: item.id,
                    title: trimmed,
                  });
                }}
              >
                עריכה
              </button>
              <button
                type="button"
                className="text-button danger-text"
                disabled={busy}
                onClick={() =>
                  void mutateSubtask({ action: "remove", id: item.id })
                }
              >
                מחיקה
              </button>
            </li>
          ))}
        </ul>
        <form
          className="task-subtask-add"
          onSubmit={(event) => {
            event.preventDefault();
            const titleValue = subtaskDraft.trim();
            if (!titleValue) return;
            void mutateSubtask({ action: "add", title: titleValue }).then(() =>
              setSubtaskDraft(""),
            );
          }}
        >
          <input
            aria-label="תת־משימה חדשה"
            placeholder="הוסף תת־משימה…"
            maxLength={200}
            value={subtaskDraft}
            disabled={busy}
            onChange={(e) => setSubtaskDraft(e.target.value)}
          />
          <button
            className="text-button"
            type="submit"
            disabled={busy || !subtaskDraft.trim()}
          >
            הוסף
          </button>
        </form>
      </div>
      {error ? (
        <div className="error-box" role="alert">
          {error}
        </div>
      ) : null}
    </section>
  );
}
