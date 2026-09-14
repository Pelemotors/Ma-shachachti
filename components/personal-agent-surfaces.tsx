"use client";

import { useState } from "react";
import { SchedulePlanCard } from "@/components/schedule-plan-card";
import type {
  ClientPresentation,
  ClientProposal,
  PresentedTask,
} from "@/lib/types";
import type {
  FreeTimeEffort,
  SurfaceContext,
} from "@/lib/chat-request";
import { formatTaskWhen } from "@/lib/time";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states";

export type SurfaceTurnState = {
  status: "idle" | "loading" | "success" | "error";
  context: SurfaceContext;
  reply: string;
  presentation: ClientPresentation | null;
  proposal: ClientProposal | null;
  messageId: string | null;
  turnId: string | null;
  error: string;
};

type RunSurfaceTurn = (context: SurfaceContext, retry?: boolean) => void;

function PresentedTaskList({ tasks }: { tasks: PresentedTask[] }) {
  return (
    <ul className="chat-task-list">
      {tasks.map((task) => (
        <li key={task.id}>
          <div className="task-copy">
            <span>{task.title}</span>
            {formatTaskWhen(task) ? <small>{formatTaskWhen(task)}</small> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function SurfaceStatus({
  state,
  onRetry,
}: {
  state: SurfaceTurnState;
  onRetry: () => void;
}) {
  if (state.status === "loading") {
    return <LoadingState label="הסוכן חושב…" compact />;
  }
  if (state.status === "error") {
    return (
      <ErrorState message={state.error} onRetry={onRetry} />
    );
  }
  return null;
}

export function ForgottenSurface({
  state,
  deepCheckState,
  onRun,
  onDeepCheck,
}: {
  state: SurfaceTurnState;
  deepCheckState: SurfaceTurnState;
  onRun: RunSurfaceTurn;
  onDeepCheck: RunSurfaceTurn;
}) {
  const run = () => onRun({ type: "forgotten" });
  const deep = () => onDeepCheck({ type: "deep-check" });
  return (
    <section className="tasks-panel agent-surface" aria-labelledby="forgotten-title">
      <h1 id="forgotten-title">מה שכחתי?</h1>
      <p className="muted">מה חשוב להחזיר עכשיו לתודעה מתוך מה שכבר ידוע.</p>
      {state.status === "idle" ? (
        <button className="settings-action" type="button" onClick={run}>
          בדוק מה שכחתי
        </button>
      ) : null}
      <SurfaceStatus state={state} onRetry={() => onRun(state.context, true)} />
      {state.status === "success" && state.reply ? <p>{state.reply}</p> : null}
      {state.status === "success" &&
      state.presentation?.type === "task_list" ? (
        <PresentedTaskList tasks={state.presentation.tasks} />
      ) : state.status === "success" ? (
        <EmptyState
          title="אין כרגע פריטים להצגה"
          description="אפשר לרענן ולבקש מהסוכן לבדוק שוב."
        />
      ) : null}
      {state.status === "success" ? (
        <div className="surface-options">
          <button className="text-button" type="button" onClick={run}>
            רענן
          </button>
          <button
            className="settings-action"
            type="button"
            disabled={deepCheckState.status === "loading"}
            onClick={deep}
          >
            בדוק לעומק
          </button>
        </div>
      ) : null}
      <SurfaceStatus
        state={deepCheckState}
        onRetry={() => onDeepCheck(deepCheckState.context, true)}
      />
      {deepCheckState.status === "success" && deepCheckState.reply ? (
        <p>{deepCheckState.reply}</p>
      ) : null}
      {deepCheckState.status === "success" &&
      deepCheckState.presentation?.type === "insights" ? (
        <ul className="task-suggestions insights-list">
          {deepCheckState.presentation.items.map((item) => (
            <li key={`${item.kind}-${item.title}`}>
              <div className="task-copy">
                <small>{item.kind === "inference" ? "הסקה" : item.kind === "gap" ? "פער" : "הצעה"}</small>
                <span>{item.title}</span>
                {item.detail ? <small>{item.detail}</small> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** @deprecated Prefer ForgottenSurface */
export function FocusSurface({
  state,
  onRun,
}: {
  state: SurfaceTurnState;
  onRun: RunSurfaceTurn;
}) {
  return (
    <ForgottenSurface
      state={state}
      deepCheckState={idleDeepCheckFallback}
      onRun={onRun}
      onDeepCheck={() => undefined}
    />
  );
}

const idleDeepCheckFallback: SurfaceTurnState = {
  status: "idle",
  context: { type: "deep-check" },
  reply: "",
  presentation: null,
  proposal: null,
  messageId: null,
  turnId: null,
  error: "",
};

const MINUTE_CHOICES = [5, 10, 20, 30, 60] as const;
const EFFORT_LABELS: Record<FreeTimeEffort, string> = {
  low: "קל",
  medium: "בינוני",
  high: "גבוה",
};

export function FreeTimeSurface({
  state,
  onRun,
}: {
  state: SurfaceTurnState;
  onRun: RunSurfaceTurn;
}) {
  const [minutes, setMinutes] = useState<number | "custom">(20);
  const [customMinutes, setCustomMinutes] = useState("");
  const [effort, setEffort] = useState<FreeTimeEffort | "">("");
  const custom = Number(customMinutes);
  const selectedMinutes = minutes === "custom" ? custom : minutes;
  const valid = Number.isInteger(selectedMinutes) && selectedMinutes >= 1 && selectedMinutes <= 480;
  const run = () => {
    if (!valid) return;
    onRun({
      type: "free-time",
      minutes: selectedMinutes,
      effort: effort || null,
    });
  };

  return (
    <section className="tasks-panel agent-surface" aria-labelledby="free-time-title">
      <h1 id="free-time-title">זמן פנוי</h1>
      <fieldset>
        <legend>כמה זמן יש לך?</legend>
        <div className="surface-options">
          {MINUTE_CHOICES.map((value) => (
            <button
              key={value}
              className={minutes === value ? "settings-action" : "text-button"}
              type="button"
              onClick={() => setMinutes(value)}
            >
              {value} דקות
            </button>
          ))}
          <button
            className={minutes === "custom" ? "settings-action" : "text-button"}
            type="button"
            onClick={() => setMinutes("custom")}
          >
            אחר
          </button>
        </div>
      </fieldset>
      {minutes === "custom" ? (
        <label>
          דקות
          <input
            aria-label="מספר דקות מותאם"
            inputMode="numeric"
            min={1}
            max={480}
            value={customMinutes}
            onChange={(event) => setCustomMinutes(event.target.value)}
          />
        </label>
      ) : null}
      <fieldset>
        <legend>רמת מאמץ (לא חובה)</legend>
        <div className="surface-options">
          {(Object.keys(EFFORT_LABELS) as FreeTimeEffort[]).map((value) => (
            <button
              key={value}
              className={effort === value ? "settings-action" : "text-button"}
              type="button"
              onClick={() => setEffort(effort === value ? "" : value)}
            >
              {EFFORT_LABELS[value]}
            </button>
          ))}
        </div>
      </fieldset>
      {minutes === "custom" && customMinutes && !valid ? (
        <div className="error-box">יש להזין בין 1 ל־480 דקות.</div>
      ) : null}
      <button
        className="settings-action"
        type="button"
        disabled={!valid || state.status === "loading"}
        onClick={run}
      >
        הצע לי מה לעשות
      </button>
      <SurfaceStatus state={state} onRetry={() => onRun(state.context, true)} />
      {state.status === "success" && state.reply ? <p>{state.reply}</p> : null}
      {state.status === "success" &&
      state.presentation?.type === "task_list" ? (
        <PresentedTaskList tasks={state.presentation.tasks} />
      ) : null}
      {state.status === "success" &&
      state.presentation?.type === "task_suggestions" ? (
        <ul className="task-suggestions">
          {state.presentation.items.map((item) => (
            <li key={item.title}>
              <div className="task-copy">
                <span>{item.title}</span>
                {item.reason ? <small>{item.reason}</small> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function ScheduleAgentPanel({
  date,
  state,
  saving,
  onRun,
  onSave,
  onToggle,
  onProposal,
  savingPlan,
  proposalBusy,
}: {
  date: string;
  state: SurfaceTurnState;
  saving: boolean;
  onRun: RunSurfaceTurn;
  onSave: (presentation: Extract<ClientPresentation, { type: "schedule_plan" }>) => void;
  onToggle: (id: string, done: boolean) => void;
  onProposal: (action: "approve" | "reject") => void;
  savingPlan: boolean;
  proposalBusy: boolean;
}) {
  const run = () =>
    onRun({
      type: "schedule",
      date,
      day_start: "08:00",
      day_end: "22:00",
    });
  return (
    <section className="agent-surface" aria-labelledby="agent-schedule-title">
      <h2 id="agent-schedule-title">תכנון עם הסוכן</h2>
      <p className="muted">מתכנן את היום המלא ({date}) בין 08:00 ל־22:00.</p>
      <button
        className="settings-action"
        type="button"
        disabled={state.status === "loading"}
        onClick={run}
      >
        צור לי לו״ז להיום
      </button>
      <SurfaceStatus state={state} onRetry={() => onRun(state.context, true)} />
      {state.status === "success" && state.reply ? <p>{state.reply}</p> : null}
      {state.status === "success" &&
      state.presentation?.type === "schedule_plan" ? (
        <SchedulePlanCard
          plan={state.presentation}
          saving={saving}
          optimistic={savingPlan}
          onToggle={onToggle}
          onSave={() => onSave(state.presentation as Extract<ClientPresentation, { type: "schedule_plan" }>)}
        />
      ) : null}
      {state.status === "success" &&
      (state.proposal?.status === "pending" ||
        state.proposal?.status === "executing") ? (
        <section className="proposal-card" aria-label="הצעה לאישור">
          <strong>הצעה לאישור</strong>
          <p>{state.proposal.summary}</p>
          {state.proposal.status === "executing" ? (
            <small className="proposal-status">מבצע…</small>
          ) : (
            <div className="proposal-actions">
              <button className="settings-action" type="button" disabled={proposalBusy} onClick={() => onProposal("approve")}>
                אשר ובצע
              </button>
              <button className="text-button" type="button" disabled={proposalBusy} onClick={() => onProposal("reject")}>
                דחה
              </button>
            </div>
          )}
        </section>
      ) : null}
    </section>
  );
}
