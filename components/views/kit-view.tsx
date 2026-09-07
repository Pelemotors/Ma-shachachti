"use client";
import { Action, AppState } from "@/lib/model";
import { categoryLabel, TASK_CATEGORIES } from "@/lib/taxonomy";
import { suggestions, catalog, templateAction } from "@/lib/catalog";
import { calendarSuggestions } from "@/lib/insights";
import { ViewHeader } from "@/components/view-header";
import { FirstScanPanel } from "@/components/views/first-scan-panel";

function startScanSession(preserveCompletedAt?: string | null): Action {
  const id = crypto.randomUUID();
  const stamp = new Date().toISOString();
  return {
    type: "scan.set",
    firstScan: {
      status: "in_progress",
      completedAt: preserveCompletedAt ?? null,
      session: {
        id,
        status: "in_progress",
        chunks: [],
        draftAnalysis: null,
        proposalId: null,
        createdAt: stamp,
        updatedAt: stamp,
      },
    },
  };
}

export function KitView(props: {
  state: AppState;
  busy: boolean;
  clock: Date;
  category: string;
  onCategory: (v: string) => void;
  act: (a: Action) => Promise<void>;
  run?: (actions: Action[], confirmed?: boolean) => Promise<void>;
  revision?: number;
  onStartScan?: () => void;
  onOpenSettings?: () => void;
}) {
  const scanDone =
    props.state.firstScan.status === "completed" ||
    props.state.firstScan.status === "skipped";

  return (
    <>
      <ViewHeader view="kit" />
      {props.state.firstScan.status === "in_progress" && props.run && (
        <FirstScanPanel
          state={props.state}
          busy={props.busy}
          revision={props.revision ?? 0}
          clock={props.clock}
          act={props.act}
          run={props.run}
          onOpenSettings={props.onOpenSettings}
        />
      )}
      {props.state.firstScan.status === "not_started" && (
        <section className="panel stack">
          <h3>רוצה לעשות סקירה ראשונה?</h3>
          <p>
            תעברי בבית ותספרי לי בקול או בכתיבה מה את רואה ומה צריך לעשות. אפשר
            לדבר חופשי — אני אסדר מזה את הבית, המשימות ואיפוס ראשוני.
          </p>
          <div className="button-row">
            <button
              className="primary"
              type="button"
              onClick={() =>
                props.onStartScan
                  ? props.onStartScan()
                  : void props.act(startScanSession())
              }
            >
              התחל סקירה
            </button>
            <button
              className="secondary"
              type="button"
              disabled={props.busy}
              onClick={() =>
                void props.act({
                  type: "scan.set",
                  firstScan: {
                    status: "skipped",
                    completedAt: null,
                    session: null,
                  },
                })
              }
            >
              אדלג כרגע
            </button>
          </div>
        </section>
      )}
      {scanDone && props.state.firstScan.status !== "in_progress" && (
        <section className="panel stack">
          <h3>סקירה מהירה של הבית</h3>
          <p className="muted">
            אותו מנוע כמו הסקירה הראשונה — אפשר לעדכן מה רואים עכשיו בלי להתחיל
            מאפס.
          </p>
          <button
            className="secondary"
            type="button"
            disabled={props.busy}
            onClick={() =>
              void props.act(
                startScanSession(props.state.firstScan.completedAt),
              )
            }
          >
            התחל סקירה מהירה
          </button>
        </section>
      )}
      {calendarSuggestions(props.state, props.clock).map((title) => (
        <article className="suggestion" key={title}>
          <span className="tag">רעיון לפי התקופה בשנה</span>
          <h3>{title}</h3>
          <button
            className="text-button"
            onClick={() =>
              void props.act({
                type: "task.create",
                task: { title, kind: "idea", categoryId: "children_daily" },
              })
            }
          >
            לשמור כאפשרות
          </button>
        </article>
      ))}
      <p className="intro">אלה הצעות בלבד. נבחר מה שמתאים, והשאר יכול לחכות.</p>
      <select
        aria-label="תחום הצעות"
        value={props.category}
        onChange={(e) => props.onCategory(e.target.value)}
      >
        <option value="הכול">הכול</option>
        {TASK_CATEGORIES.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <div className="task-list">
        {suggestions(props.state)
          .filter(
            (t) => props.category === "הכול" || t.categoryId === props.category,
          )
          .slice(0, 12)
          .map((t) => (
            <article className="suggestion" key={t.id}>
              <span className="tag">הצעה · {categoryLabel(t.categoryId)}</span>
              <h3>{t.title}</h3>
              <p>
                כ־{t.workMinutes} דקות עבודה
                {t.waitMinutes ? ` ועוד ${t.waitMinutes} דקות המתנה` : ""} ·
                אומדן התחלתי
              </p>
              <div className="button-row">
                <button
                  className="secondary"
                  disabled={props.busy}
                  onClick={() => void props.act(templateAction(t.id))}
                >
                  כן, עושים אצלנו
                </button>
                <button
                  className="text-button"
                  disabled={props.busy}
                  onClick={() =>
                    void props.act({ type: "template.exclude", id: t.id })
                  }
                >
                  לא רלוונטי לבית
                </button>
              </div>
            </article>
          ))}
      </div>
      {props.state.excludedTemplates.length > 0 && (
        <details>
          <summary>הצעות שסומנו כלא רלוונטיות</summary>
          {props.state.excludedTemplates.map((id) => (
            <div className="list-row" key={id}>
              <span>{catalog.find((t) => t.id === id)?.title}</span>
              <button
                onClick={() => void props.act({ type: "template.restore", id })}
              >
                להחזיר להצעות
              </button>
            </div>
          ))}
        </details>
      )}
    </>
  );
}
