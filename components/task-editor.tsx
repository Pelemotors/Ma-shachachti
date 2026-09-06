"use client";
import { useState } from "react";
import { Action, AppState, Task, categories } from "@/lib/model";
import { Dialog } from "./dialog";
export function TaskEditor({
  task,
  state,
  onSave,
  onClose,
}: {
  task?: Task;
  state: AppState;
  onSave: (a: Action) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? ""),
    [category, setCategory] = useState<Task["category"]>(
      task?.category ?? "שונות / לא מסווג",
    ),
    [kind, setKind] = useState<Task["kind"]>(task?.kind ?? "task"),
    [work, setWork] = useState(task?.workMinutes ?? 15),
    [wait, setWait] = useState(task?.waitMinutes ?? 0),
    [effort, setEffort] = useState(task?.effort ?? 2),
    [priority, setPriority] = useState(task?.priority ?? 1),
    [days, setDays] = useState(task?.recurrenceDays ?? 0),
    [due, setDue] = useState(""),
    [clearDue, setClearDue] = useState(false),
    [notes, setNotes] = useState(task?.notes ?? ""),
    [steps, setSteps] = useState(
      task?.steps.map((x) => x.title).join("\n") ?? "",
    ),
    [deps, setDeps] = useState(task?.dependsOn ?? []),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const patch = {
        title: title.trim(),
        category,
        kind,
        workMinutes: work,
        waitMinutes: wait,
        effort,
        priority,
        recurrenceDays: days || null,
        dueAt: clearDue
          ? null
          : due
            ? new Date(due).toISOString()
            : (task?.dueAt ?? null),
        notes,
        dependsOn: deps,
        steps: steps
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean)
          .map(
            (title) =>
              task?.steps.find((s) => s.title === title) ?? {
                id: crypto.randomUUID(),
                title,
                done: false,
              },
          ),
      };
      await onSave(
        task
          ? { type: "task.update", id: task.id, patch }
          : { type: "task.create", task: patch },
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "לא נשמר");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog
      title={task ? "פרטי המשימה" : "להוריד משהו מהראש"}
      onClose={onClose}
    >
      <form onSubmit={submit} className="stack">
        <label>
          מה צריך לעשות?
          <input
            autoFocus
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label>
            תחום
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Task["category"])}
            >
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            איך לשמור?
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as Task["kind"])}
            >
              <option value="task">משימה</option>
              <option value="idea">רעיון, אם יתאים</option>
            </select>
          </label>
          <label>
            זמן עבודה בדקות
            <input
              type="number"
              min={1}
              max={1440}
              value={work}
              onChange={(e) => setWork(+e.target.value)}
            />
          </label>
          <label>
            זמן המתנה בדקות
            <input
              type="number"
              min={0}
              max={1440}
              value={wait}
              onChange={(e) => setWait(+e.target.value)}
            />
          </label>
          <label>
            כוח שנדרש
            <select value={effort} onChange={(e) => setEffort(+e.target.value)}>
              <option value={1}>מעט</option>
              <option value={2}>בינוני</option>
              <option value={3}>הרבה</option>
            </select>
          </label>
          <label>
            חשיבות
            <select
              value={priority}
              onChange={(e) => setPriority(+e.target.value)}
            >
              <option value={0}>כשיתאפשר</option>
              <option value={1}>רגילה</option>
              <option value={2}>חשובה</option>
              <option value={3}>דחופה</option>
            </select>
          </label>
        </div>
        <details>
          <summary>מועד, חזרה ושלבים</summary>
          <div className="stack">
            <label>
              מועד אמיתי, אם יש
              <input
                type="datetime-local"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </label>
            <small>המועד מוזן לפי השעה במכשיר. בלי מועד — אין דדליין.</small>
            {task?.dueAt && (
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={clearDue}
                  onChange={(e) => setClearDue(e.target.checked)}
                />
                הסרת המועד הקיים
              </label>
            )}
            <label>
              חזרה בכל כמה ימים? 0 = חד־פעמי
              <input
                type="number"
                min={0}
                max={366}
                value={days}
                onChange={(e) => setDays(+e.target.value)}
              />
            </label>
            <label>
              שלבי ביצוע — שלב בכל שורה
              <textarea
                value={steps}
                onChange={(e) => setSteps(e.target.value)}
                rows={3}
              />
            </label>
            <label>
              הערות
              <textarea
                maxLength={2000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <fieldset>
              <legend>מה צריך להסתיים קודם?</legend>
              {state.tasks
                .filter((t) => t.id !== task?.id && t.status === "open")
                .map((t) => (
                  <label key={t.id} className="check-line">
                    <input
                      type="checkbox"
                      checked={deps.includes(t.id)}
                      onChange={(e) =>
                        setDeps(
                          e.target.checked
                            ? [...deps, t.id]
                            : deps.filter((id) => id !== t.id),
                        )
                      }
                    />
                    {t.title}
                  </label>
                ))}
            </fieldset>
          </div>
        </details>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="primary" disabled={saving}>
          {saving ? "שומר…" : "שמירה"}
        </button>
      </form>
    </Dialog>
  );
}
