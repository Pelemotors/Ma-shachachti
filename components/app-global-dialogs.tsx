"use client";
import { Action, AppState, Task } from "@/lib/model";
import type { LifeAdminConfirmResponse } from "@/lib/domain/notifications/life-admin";
import { Dialog } from "./dialog";
import { TaskEditor } from "./task-editor";
import { describe } from "./action-describe";

export function AppGlobalDialogs(props: {
  state: AppState;
  busy: boolean;
  editor: Task | "new" | null;
  completion: Task | null;
  workActual: string;
  confirm: Action[] | null;
  lifeAdminPrompt: { completedAtMinutes: number } | null;
  onCloseEditor: () => void;
  onSaveEditor: (
    actions: Action[],
    meta?: { requestAgentPlacement?: { taskId: string; title: string } },
  ) => Promise<void>;
  onCloseCompletion: () => void;
  onWorkActual: (v: string) => void;
  onSubmitCompletion: () => void;
  onCloseConfirm: () => void;
  onSubmitConfirm: () => void;
  onCloseLifeAdminPrompt: () => void;
  onLifeAdminResponse: (response: LifeAdminConfirmResponse) => void;
}) {
  return (
    <>
      {props.editor && (
        <TaskEditor
          task={props.editor === "new" ? undefined : props.editor}
          state={props.state}
          onSave={props.onSaveEditor}
          onClose={props.onCloseEditor}
        />
      )}
      {props.completion && (
        <Dialog title="סיימת עם המשימה" onClose={props.onCloseCompletion}>
          <p>{props.completion.title}</p>
          <label>
            כמה דקות עבודה בפועל? אפשר לדלג
            <input
              type="number"
              min={1}
              max={1440}
              value={props.workActual}
              onChange={(e) => props.onWorkActual(e.target.value)}
              placeholder="בלי זמן ההמתנה וההפסקות"
            />
          </label>
          <div className="button-row">
            <button
              className="primary"
              disabled={props.busy}
              onClick={() => void props.onSubmitCompletion()}
            >
              סימון כבוצע
            </button>
            <button className="secondary" onClick={props.onCloseCompletion}>
              חזרה
            </button>
          </div>
        </Dialog>
      )}
      {props.lifeAdminPrompt && (
        <Dialog title="מתי נוח לך?" onClose={props.onCloseLifeAdminPrompt}>
          <p>בדרך כלל נוח לך לטפל בדברים כאלה בערך בשעה הזו?</p>
          <div className="button-row">
            <button
              className="primary"
              disabled={props.busy}
              onClick={() => props.onLifeAdminResponse("yes")}
            >
              כן
            </button>
            <button
              className="secondary"
              disabled={props.busy}
              onClick={() => props.onLifeAdminResponse("earlier")}
            >
              מוקדם יותר
            </button>
            <button
              className="secondary"
              disabled={props.busy}
              onClick={() => props.onLifeAdminResponse("later")}
            >
              מאוחר יותר
            </button>
            <button
              className="secondary"
              disabled={props.busy}
              onClick={() => props.onLifeAdminResponse("varies")}
            >
              משתנה
            </button>
          </div>
        </Dialog>
      )}
      {props.confirm && (
        <Dialog title="לאשר את השינוי?" onClose={props.onCloseConfirm}>
          <ul>
            {props.confirm.map((a, i) => (
              <li key={i}>
                {describe(a)}
                {"id" in a && props.state.tasks.find((t) => t.id === a.id)
                  ? ` — ${props.state.tasks.find((t) => t.id === a.id)?.title}`
                  : ""}
              </li>
            ))}
          </ul>
          <p>השינוי יבוצע רק אחרי האישור שלך.</p>
          <div className="button-row">
            <button
              className="primary"
              disabled={props.busy}
              onClick={() => void props.onSubmitConfirm()}
            >
              אישור
            </button>
            <button className="secondary" onClick={props.onCloseConfirm}>
              חזרה
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
