"use client";
import { useState } from "react";
import { Action, AppState, Task } from "@/lib/model";
import { TASK_CATEGORIES, CategoryId } from "@/lib/taxonomy";
import { isoAtLocal } from "@/lib/time";
import { Dialog } from "./dialog";

export function TaskEditor({
  task,
  state,
  onSave,
  onClose,
}: {
  task?: Task;
  state: AppState;
  onSave: (
    actions: Action[],
    meta?: { requestAgentPlacement?: { taskId: string; title: string } },
  ) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [hasDeadline, setHasDeadline] = useState(Boolean(task?.dueAt));
  const [dueDate, setDueDate] = useState(
    task?.dueAt ? task.dueAt.slice(0, 10) : "",
  );
  const [dueTime, setDueTime] = useState(
    task?.dueAt
      ? new Date(task.dueAt).toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: state.profile.timezone,
        })
      : "12:00",
  );
  const [more, setMore] = useState(false);
  const [categoryId, setCategoryId] = useState<CategoryId>(
    task?.categoryId ?? "unclassified",
  );
  const [kind, setKind] = useState<Task["kind"]>(task?.kind ?? "task");
  const [work, setWork] = useState(task?.workMinutes ?? 15);
  const [wait, setWait] = useState(task?.waitMinutes ?? 0);
  const [effort, setEffort] = useState(task?.effort ?? 2);
  const [priority, setPriority] = useState(task?.priority ?? 1);
  const [days, setDays] = useState(task?.recurrenceDays ?? 0);
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [steps, setSteps] = useState(
    task?.steps.map((x) => x.title).join("\n") ?? "",
  );
  const [deps, setDeps] = useState(task?.dependsOn ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [placement, setPlacement] = useState<
    "agent" | "dated" | "someday"
  >(task ? "someday" : "agent");
  const [placeDate, setPlaceDate] = useState("");
  const [placeTime, setPlaceTime] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("צריך כותרת למשימה.");
      return;
    }
    if (hasDeadline && (!dueDate || !dueTime)) {
      setError("כשמופעל דדליין צריך תאריך ושעה.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const dueAt = hasDeadline
        ? new Date(`${dueDate}T${dueTime}:00`).toISOString()
        : null;
      const userChangedCategory =
        Boolean(task) && task!.categoryId !== categoryId;
      const patch = {
        title: title.trim(),
        categoryId,
        detailTypeId: task?.detailTypeId ?? null,
        classification: {
          source:
            userChangedCategory || (!task && categoryId !== "unclassified")
              ? ("user" as const)
              : (task?.classification.source ?? "user"),
          confidence: "high" as const,
          userOverride:
            userChangedCategory || Boolean(task?.classification.userOverride),
        },
        enrichmentStatus: task?.enrichmentStatus ?? "pending",
        kind,
        workMinutes: work,
        waitMinutes: wait,
        effort,
        priority,
        recurrenceDays: days || null,
        dueAt,
        notes,
        dependsOn: deps,
        steps: steps
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean)
          .map(
            (stepTitle) =>
              task?.steps.find((s) => s.title === stepTitle) ?? {
                id: crypto.randomUUID(),
                title: stepTitle,
                done: false,
              },
          ),
      };
      if (task) {
        await onSave([{ type: "task.update", id: task.id, patch }]);
        onClose();
        return;
      }
      const taskId = crypto.randomUUID();
      const actions: Action[] = [
        { type: "task.create", task: { ...patch, id: taskId } },
      ];
      if (placement === "dated") {
        if (!placeDate) {
          setError("כשבוחרים שיבוץ צריך תאריך.");
          setSaving(false);
          return;
        }
        const plannedStart = placeTime
          ? isoAtLocal(
              placeDate,
              Number(placeTime.slice(0, 2)),
              Number(placeTime.slice(3, 5)),
              state.profile.timezone,
            )
          : null;
        actions.push({
          type: "schedule.set",
          taskId,
          date: placeDate,
          plannedStart,
        });
      }
      await onSave(
        actions,
        placement === "agent"
          ? { requestAgentPlacement: { taskId, title: patch.title } }
          : undefined,
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא נשמר");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog title={task ? "עריכת משימה" : "משימה חדשה"} onClose={onClose}>
      <form className="stack gap" onSubmit={submit}>
        <label className="stack tight">
          <span>מה צריך לעשות?</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
            aria-label="מה צריך לעשות"
          />
        </label>

        <label className="row gap align-center">
          <input
            type="checkbox"
            checked={hasDeadline}
            onChange={(e) => setHasDeadline(e.target.checked)}
          />
          <span>יש דדליין?</span>
        </label>
        {!task ? (
          <fieldset className="stack tight">
            <legend>שיבוץ בלו״ז</legend>
            <label className="row gap align-center">
              <input
                type="radio"
                name="placement"
                checked={placement === "agent"}
                onChange={() => setPlacement("agent")}
              />
              <span>הסוכן ישבץ מקום מתאים</span>
            </label>
            <label className="row gap align-center">
              <input
                type="radio"
                name="placement"
                checked={placement === "dated"}
                onChange={() => setPlacement("dated")}
              />
              <span>לתאריך מסוים</span>
            </label>
            <label className="row gap align-center">
              <input
                type="radio"
                name="placement"
                checked={placement === "someday"}
                onChange={() => setPlacement("someday")}
              />
              <span>מתישהו / ללא שיבוץ</span>
            </label>
            {placement === "dated" ? (
              <div className="row gap wrap">
                <label className="stack tight grow">
                  <span>תאריך בלו״ז</span>
                  <input
                    type="date"
                    value={placeDate}
                    onChange={(e) => setPlaceDate(e.target.value)}
                    required
                  />
                </label>
                <label className="stack tight grow">
                  <span>שעה (רשות)</span>
                  <input
                    type="time"
                    value={placeTime}
                    onChange={(e) => setPlaceTime(e.target.value)}
                  />
                </label>
              </div>
            ) : null}
          </fieldset>
        ) : null}

        {hasDeadline ? (
          <div className="row gap wrap">
            <label className="stack tight grow">
              <span>תאריך</span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required={hasDeadline}
              />
            </label>
            <label className="stack tight grow">
              <span>שעה</span>
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                required={hasDeadline}
              />
            </label>
          </div>
        ) : null}

        <button
          type="button"
          className="text-button"
          onClick={() => setMore((v) => !v)}
        >
          {more ? "פחות פרטים" : "עוד פרטים"}
        </button>

        {more ? (
          <div className="stack gap">
            <label className="stack tight">
              <span>סוג</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as Task["kind"])}
              >
                <option value="task">משימה</option>
                <option value="idea">רעיון</option>
              </select>
            </label>
            <label className="stack tight">
              <span>קטגוריה</span>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value as CategoryId)}
              >
                {TASK_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="row gap wrap">
              <label className="stack tight">
                <span>זמן עבודה</span>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={work}
                  onChange={(e) => setWork(Number(e.target.value))}
                />
              </label>
              <label className="stack tight">
                <span>זמן המתנה</span>
                <input
                  type="number"
                  min={0}
                  max={1440}
                  value={wait}
                  onChange={(e) => setWait(Number(e.target.value))}
                />
              </label>
              <label className="stack tight">
                <span>כוח</span>
                <input
                  type="number"
                  min={1}
                  max={3}
                  value={effort}
                  onChange={(e) => setEffort(Number(e.target.value))}
                />
              </label>
              <label className="stack tight">
                <span>עדיפות</span>
                <input
                  type="number"
                  min={0}
                  max={3}
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                />
              </label>
            </div>
            <label className="stack tight">
              <span>חזרה כל כמה ימים</span>
              <input
                type="number"
                min={0}
                max={366}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              />
            </label>
            <label className="stack tight">
              <span>שלבים (שורה לכל שלב)</span>
              <textarea
                value={steps}
                onChange={(e) => setSteps(e.target.value)}
                rows={3}
              />
            </label>
            <label className="stack tight">
              <span>הערות</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </label>
            <label className="stack tight">
              <span>תלויות</span>
              <select
                multiple
                value={deps}
                onChange={(e) =>
                  setDeps(
                    Array.from(e.target.selectedOptions).map((o) => o.value),
                  )
                }
              >
                {state.tasks
                  .filter((t) => t.id !== task?.id && t.status !== "done")
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        ) : null}

        {error ? <p className="error">{error}</p> : null}
        <div className="row gap">
          <button type="submit" className="primary" disabled={saving}>
            שמירה
          </button>
          <button type="button" className="text-button" onClick={onClose}>
            ביטול
          </button>
        </div>
      </form>
    </Dialog>
  );
}
