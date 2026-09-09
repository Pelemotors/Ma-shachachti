"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Action, AppState, Task } from "@/lib/model";
import { formatTime } from "@/lib/time";
import { ViewHeader } from "@/components/view-header";
import { Empty } from "@/components/empty-state";

export function MemoryView(props: {
  state: AppState;
  busy: boolean;
  clock: Date;
  run: (actions: Action[], confirmed?: boolean) => Promise<void>;
  act: (a: Action) => Promise<void>;
  onRemember: (
    text: string,
    context?: {
      requestedLifetime?: "stable" | "temporary";
      expiresAt?: string | null;
    },
  ) => Promise<string>;
  onEditTask: (t: Task) => void;
  onNotice: (msg: string) => void;
}) {
  const [factText, setFactText] = useState("");
  const [factKind, setFactKind] = useState<"stable" | "temporary">("stable");
  const [factExpiry, setFactExpiry] = useState("");
  const [saving, setSaving] = useState(false);

  function memoryContext() {
    return {
      requestedLifetime: factKind,
      expiresAt:
        factKind === "temporary" && factExpiry
          ? new Date(factExpiry).toISOString()
          : null,
    };
  }

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
            const reply = await props.onRemember(text, memoryContext());
            setFactText("");
            if (reply) props.onNotice(reply);
          } catch {
            props.onNotice(
              "הסוכן לא זמין כרגע. אפשר לשמור ידנית בלי סוכן, או לנסות שוב.",
            );
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
        <button
          type="button"
          className="text-button"
          disabled={props.busy || saving}
          onClick={async () => {
            const text = factText.trim();
            if (!text || saving) return;
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
              props.onNotice("נשמר ידנית, בלי עיבוד של הסוכן.");
            } finally {
              setSaving(false);
            }
          }}
        >
          שמירה ידנית בלי סוכן
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
    </>
  );
}
