"use client";
import { useState } from "react";
import { AppState } from "@/lib/model";
import { formatTime } from "@/lib/time";
import { ViewHeader } from "@/components/view-header";
import { DevicePermissionsPanel } from "@/components/device-permissions-panel";
import { Dialog } from "@/components/dialog";

type ReminderUrgency = "urgent" | "medium" | "low";

type ReminderRow = AppState["reminders"][number];

function toLocalInput(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function RemindersView(props: {
  state: AppState;
  busy: boolean;
  mode: string;
  pushEnabled: boolean;
  pushBusy: boolean;
  pushReady: boolean;
  reminderTitle: string;
  reminderDue: string;
  reminderUrgency: ReminderUrgency;
  reminders: ReminderRow[];
  onTitle: (v: string) => void;
  onDue: (v: string) => void;
  onUrgency: (v: ReminderUrgency) => void;
  onAdd: () => void;
  onEnablePush: () => void;
  onCancel: (id: string) => void;
  onUpdate: (
    id: string,
    patch: { title?: string; dueAt?: string; urgency?: ReminderUrgency },
  ) => Promise<void>;
}) {
  const [editing, setEditing] = useState<ReminderRow | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDue, setEditDue] = useState("");
  const [editUrgency, setEditUrgency] = useState<ReminderUrgency>("medium");
  const [editBusy, setEditBusy] = useState(false);

  function openEdit(r: ReminderRow) {
    setEditing(r);
    setEditTitle(r.title);
    setEditDue(toLocalInput(r.dueAt));
    setEditUrgency(r.urgency ?? "medium");
  }

  async function saveEdit() {
    if (!editing || !editTitle.trim() || !editDue) return;
    setEditBusy(true);
    try {
      await props.onUpdate(editing.id, {
        title: editTitle.trim(),
        dueAt: new Date(editDue).toISOString(),
        urgency: editUrgency,
      });
      setEditing(null);
    } finally {
      setEditBusy(false);
    }
  }

  return (
    <>
      <ViewHeader view="reminders" />
      <p className="intro">
        {props.mode === "local"
          ? "התזכורות בהדגמה נשמרות במכשיר בלבד. אין שליחת התראות ברקע."
          : props.pushEnabled
            ? "המכשיר רשום להתראות. מסירה תלויה בחיבור ובשעות השקט. תזכורת דחופה יכולה לעבור גם בשעות השקט."
            : "התזכורות נשמרות ברשימה. כדי לקבל התראה צריך להפעיל התראות במכשיר."}
      </p>
      <DevicePermissionsPanel
        mode={props.mode}
        pushEnabled={props.pushEnabled}
        pushBusy={props.pushBusy}
        pushReady={props.pushReady}
        onEnablePush={props.onEnablePush}
      />
      <form
        className="panel stack"
        onSubmit={(e) => {
          e.preventDefault();
          void props.onAdd();
        }}
      >
        <label>
          מה להזכיר?
          <input
            required
            maxLength={200}
            value={props.reminderTitle}
            onChange={(e) => props.onTitle(e.target.value)}
          />
        </label>
        <label>
          מתי? לפי השעה במכשיר
          <input
            type="datetime-local"
            required
            value={props.reminderDue}
            onChange={(e) => props.onDue(e.target.value)}
          />
        </label>
        <label>
          חשיבות ההתראה
          <select
            value={props.reminderUrgency}
            onChange={(e) =>
              props.onUrgency(e.target.value as ReminderUrgency)
            }
          >
            <option value="low">נמוכה — אפשר לחכות</option>
            <option value="medium">רגילה</option>
            <option value="urgent">דחופה — גם בשעות שקט</option>
          </select>
        </label>
        <button className="primary" disabled={props.busy}>
          שמירת תזכורת
        </button>
      </form>
      {props.reminders.map((r) => (
        <article className="list-row panel" key={r.id}>
          <div>
            <strong>{r.title}</strong>
            <p>
              {formatTime(r.dueAt, props.state.profile.timezone)} ·{" "}
              {r.urgency === "urgent"
                ? "דחופה · "
                : r.urgency === "low"
                  ? "חשיבות נמוכה · "
                  : ""}
              {
                {
                  pending: "ממתינה",
                  sent: "נשלחה לשירות ההתראות",
                  failed: "השליחה לא הצליחה",
                  cancelled: "בוטלה",
                }[r.status]
              }
            </p>
          </div>
          {r.status === "pending" && (
            <div className="button-row">
              <button
                type="button"
                className="secondary"
                onClick={() => openEdit(r)}
              >
                עריכה
              </button>
              <button type="button" onClick={() => props.onCancel(r.id)}>
                ביטול
              </button>
            </div>
          )}
        </article>
      ))}

      {editing && (
        <Dialog title="עריכת תזכורת" onClose={() => setEditing(null)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void saveEdit();
            }}
          >
            <label>
              מה להזכיר?
              <input
                required
                maxLength={200}
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </label>
            <label>
              מתי?
              <input
                type="datetime-local"
                required
                value={editDue}
                onChange={(e) => setEditDue(e.target.value)}
              />
            </label>
            <label>
              חשיבות
              <select
                value={editUrgency}
                onChange={(e) =>
                  setEditUrgency(e.target.value as ReminderUrgency)
                }
              >
                <option value="low">נמוכה</option>
                <option value="medium">רגילה</option>
                <option value="urgent">דחופה</option>
              </select>
            </label>
            <div className="button-row">
              <button className="primary" disabled={editBusy || props.busy}>
                שמור
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setEditing(null)}
              >
                ביטול
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
