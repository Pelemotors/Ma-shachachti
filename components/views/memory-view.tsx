"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Action, AppState, Task } from "@/lib/model";
import { learning } from "@/lib/engine";
import { formatTime } from "@/lib/time";
import { consumptionInsights } from "@/lib/insights";
import { ViewHeader } from "@/components/view-header";
import { Empty } from "@/components/empty-state";

export function MemoryView(props: {
  state: AppState;
  busy: boolean;
  clock: Date;
  run: (actions: Action[], confirmed?: boolean) => Promise<void>;
  act: (a: Action) => Promise<void>;
  onRemember: (text: string) => Promise<string>;
  onEditTask: (t: Task) => void;
  onNotice: (msg: string) => void;
}) {
  const [factText, setFactText] = useState("");
  const [factKind, setFactKind] = useState<"stable" | "temporary">("stable");
  const [factExpiry, setFactExpiry] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <>
      <ViewHeader view="memory" />
      <p className="intro">
        אפשר לתקן ולהסיר. מידע שהתיישן מפסיק להשפיע על ההצעות.
      </p>
      <form
        className="panel stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (saving) return;
          const text = factText.trim();
          if (!text) return;
          setSaving(true);
          try {
            await props.run([
              {
                type: "fact.add",
                text,
                kind: factKind,
                expiresAt:
                  factKind === "temporary"
                    ? new Date(factExpiry).toISOString()
                    : null,
              },
            ]);
            setFactText("");
            try {
              const reply = await props.onRemember(text);
              if (reply) props.onNotice(reply);
            } catch {
              props.onNotice("המידע נשמר. העיבוד החכם לא הושלם כרגע.");
            }
          } finally {
            setSaving(false);
          }
        }}
      >
        <label>
          משהו שכדאי שאזכור
          <input
            required
            maxLength={500}
            value={factText}
            onChange={(e) => setFactText(e.target.value)}
            placeholder="למשל: מעדיפים קניות ביום חמישי"
          />
        </label>
        <label>
          לכמה זמן?
          <select
            value={factKind}
            onChange={(e) => setFactKind(e.target.value as typeof factKind)}
          >
            <option value="stable">עד שאעדכן</option>
            <option value="temporary">מידע זמני</option>
          </select>
        </label>
        {factKind === "temporary" && (
          <label>
            נכון עד
            <input
              required
              type="datetime-local"
              value={factExpiry}
              onChange={(e) => setFactExpiry(e.target.value)}
            />
          </label>
        )}
        <button className="secondary" disabled={props.busy || saving}>
          שמירה בזיכרון
        </button>
      </form>
      <div className="task-list">
        {props.state.facts.map((f) => (
          <article className="memory-card" key={f.id}>
            <div>
              <span className="tag">
                {f.kind === "inference"
                  ? "השערה"
                  : f.kind === "temporary"
                    ? "מידע זמני"
                    : "מידע שנמסר"}
                {f.expiresAt && new Date(f.expiresAt) <= props.clock
                  ? " · התיישן"
                  : ""}
              </span>
              <p>{f.text}</p>
              {f.expiresAt && (
                <small>
                  תוקף: {formatTime(f.expiresAt, props.state.profile.timezone)}
                </small>
              )}
            </div>
            <button
              className="icon-button"
              aria-label={"הסרת " + f.text}
              onClick={() => void props.act({ type: "fact.remove", id: f.id })}
            >
              <Trash2 size={17} />
            </button>
          </article>
        ))}
      </div>
      {!props.state.facts.length && (
        <Empty text="עדיין אין פרטים שמורים מעבר לפרופיל הבית." />
      )}
      <h2>מחזורי קנייה</h2>
      {consumptionInsights(props.state, props.clock).length ? (
        consumptionInsights(props.state, props.clock).map((i) => (
          <article className="panel" key={i.title}>
            <strong>{i.title}</strong>
            <p>
              הרכישות חוזרות בערך כל {i.days} ימים, לפי {i.samples} רכישות. אולי
              כדאי לבדוק מלאי סביב{" "}
              {formatTime(i.expected, props.state.profile.timezone)}.
            </p>
            <small>זו תחזית קנייה, לא ידיעה שהמוצר נגמר.</small>
          </article>
        ))
      ) : (
        <p className="muted">
          לאחר כמה רכישות נוכל להציע מתי לבדוק מלאי. לא נסיק שהמוצר נגמר רק כי
          נקנה חדש.
        </p>
      )}
      <h2>מה מתחיל להסתמן</h2>
      {learning(props.state).length ? (
        learning(props.state).map((l, i) => (
          <article className="panel" key={i}>
            <strong>{l.title}</strong>
            <p>
              אולי מתאים מחזור של כ־{l.days} ימים, לפי {l.samples} ביצועים. זו
              הצעה, והשגרה לא שונתה.
            </p>
            <button
              className="text-button"
              onClick={() => {
                const t = props.state.tasks.find(
                  (task) =>
                    (l.templateId
                      ? task.templateId === l.templateId
                      : task.title === l.title) && task.status === "open",
                );
                if (t) props.onEditTask(t);
                else props.onNotice("אפשר להגדיר חזרה ביצירת המשימה הבאה.");
              }}
            >
              לבחון התאמת חזרה
            </button>
          </article>
        ))
      ) : (
        <p className="muted">
          נלמד רק אחרי כמה ביצועים. יום יוצא דופן לא ישנה את השגרה.
        </p>
      )}
    </>
  );
}
