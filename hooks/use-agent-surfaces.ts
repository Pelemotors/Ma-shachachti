"use client";

import { useState } from "react";
import { authFetch } from "@/lib/supabase-browser";
import { isAccountAccessDenied } from "@/lib/account-access";
import { isSessionId } from "@/lib/chat-sessions";
import type { SurfaceContext } from "@/lib/chat-request";
import type { ChatSurface } from "@/lib/home-surfaces";
import type { SurfaceTurnState } from "@/components/personal-agent-surfaces";
import type { ClientPresentation, TaskRow } from "@/lib/types";
import {
  OptimisticMutationLayer,
  type OptimisticFailure,
} from "@/lib/optimistic-mutation";
import { chooseSurfaceTurnId } from "@/lib/surface-turn";

export function idleSurfaceState(context: SurfaceContext): SurfaceTurnState {
  return {
    status: "idle",
    context,
    reply: "",
    presentation: null,
    proposal: null,
    messageId: null,
    turnId: null,
    error: "",
  };
}

function reconcileSchedulePlan(
  plan: Extract<ClientPresentation, { type: "schedule_plan" }>,
  tasks: TaskRow[],
) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const byTitle = new Map(tasks.map((task) => [task.title, task]));
  return {
    ...plan,
    saved: true,
    items: plan.items.map((item) => {
      const task = item.task_id
        ? byId.get(item.task_id)
        : byTitle.get(item.title);
      return task
        ? {
            ...item,
            task_id: task.id,
            title: task.title,
            status: task.status,
            fixed: Boolean(task.due_at),
          }
        : item;
    }),
  };
}

export function useAgentSurfaces(input: {
  initialDate: string;
  sessionId: string | null;
  userId: string | null;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  setSessionId: (id: string) => void;
  rememberSession: (id: string) => void;
  publishTasks: (tasks: TaskRow[]) => void;
  onUnauthorized: () => void;
  mutations: OptimisticMutationLayer;
  onFailure: (failure: OptimisticFailure | null) => void;
}) {
  const [operation, setOperation] = useState<"save" | "proposal" | null>(null);
  const [surfaceTurns, setSurfaceTurns] = useState(() => ({
    forgotten: idleSurfaceState({ type: "forgotten" }),
    "deep-check": idleSurfaceState({ type: "deep-check" }),
    schedule: idleSurfaceState({
      type: "schedule",
      date: input.initialDate,
      day_start: "08:00",
      day_end: "22:00",
    }),
    "free-time": idleSurfaceState({
      type: "free-time",
      minutes: 20,
      effort: null,
    }),
  }));

  function resetSchedule(date: string) {
    setSurfaceTurns((current) => ({
      ...current,
      schedule: idleSurfaceState({
        type: "schedule",
        date,
        day_start: "08:00",
        day_end: "22:00",
      }),
    }));
  }

  function surfaceFailure(kind: "save" | "proposal") {
    return (failure: OptimisticFailure | null) => {
      if (!failure) {
        input.onFailure(null);
        return;
      }
      input.onFailure({
        ...failure,
        retry: async () => {
          input.setBusy(true);
          setOperation(kind);
          try {
            return await failure.retry();
          } finally {
            input.setBusy(false);
            setOperation(null);
          }
        },
      });
    };
  }

  async function run(context: SurfaceContext, retry = false) {
    const key = context.type;
    const surface: ChatSurface = key;
    const previous = surfaceTurns[key];
    const turnId = chooseSurfaceTurnId({
      retry,
      previousStatus: previous.status,
      previousTurnId: previous.turnId,
    });
    const objective =
      context.type === "forgotten"
        ? "מה שכחתי?"
        : context.type === "deep-check"
          ? "בדוק לעומק"
        : context.type === "schedule"
          ? `צור לי לו״ז לתאריך ${context.date} בין ${context.day_start} ל־${context.day_end}`
          : "הצע לי מה מתאים לחלון הזמן הפנוי";
    setSurfaceTurns((current) => ({
      ...current,
      [key]: {
        ...current[key],
        status: "loading",
        context,
        turnId,
        error: "",
      },
    }));
    try {
      const response = await authFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: objective,
          surface,
          surface_context: context,
          session_id: input.sessionId,
          turn_id: turnId,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (
        response.status === 401 ||
        isAccountAccessDenied(response.status, body.error)
      ) {
        throw new Error("unauthorized");
      }
      if (!response.ok) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "לא הצלחנו להגיע לסוכן.",
        );
      }
      if (Array.isArray(body.tasks)) input.publishTasks(body.tasks);
      if (isSessionId(body.session_id)) {
        input.setSessionId(body.session_id);
        input.rememberSession(body.session_id);
      }
      setSurfaceTurns((current) => ({
        ...current,
        [key]: {
          status: "success",
          context,
          turnId,
          reply: typeof body.reply === "string" ? body.reply : "",
          presentation: body.presentation ?? null,
          proposal: body.proposal ?? null,
          messageId: typeof body.id === "string" ? body.id : null,
          error: "",
        },
      }));
    } catch (error) {
      const unauthorized =
        error instanceof Error && error.message === "unauthorized";
      setSurfaceTurns((current) => ({
        ...current,
        [key]: {
          ...current[key],
          status: "error",
          context,
          turnId,
          error: unauthorized
            ? "נדרשת התחברות מחדש."
            : error instanceof Error
              ? error.message
              : "לא הצלחנו להגיע לסוכן.",
        },
      }));
      if (unauthorized) input.onUnauthorized();
    }
  }

  async function saveSchedulePlan(
    plan: Extract<ClientPresentation, { type: "schedule_plan" }>,
  ) {
    if (input.busy) return;
    input.setBusy(true);
    setOperation("save");
    try {
      await input.mutations.run<SurfaceTurnState>(
        {
          key: `surface-schedule-save:${plan.date}`,
          current: () => surfaceTurns.schedule,
          optimistic: (snapshot) => ({
            ...snapshot,
            presentation:
              snapshot.presentation?.type === "schedule_plan"
                ? { ...snapshot.presentation, saved: true }
                : snapshot.presentation,
          }),
          commit: async () => {
            const response = await authFetch("/api/tasks/plan", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                date: plan.date,
                items: plan.items.map((item) => ({
                  task_id: item.task_id,
                  title: item.title,
                  planned_start: item.planned_start,
                  planned_end: item.planned_end,
                  anchor: item.fixed ? "fixed" : "planned",
                })),
              }),
            });
            const body = await response.json().catch(() => ({}));
            if (
              response.status === 401 ||
              isAccountAccessDenied(response.status, body.error)
            ) {
              input.onUnauthorized();
              throw new Error("unauthorized");
            }
            if (!response.ok || !Array.isArray(body.tasks)) {
              throw new Error("schedule_failed");
            }
            const tasks = body.tasks as TaskRow[];
            input.publishTasks(tasks);
            return {
              ...surfaceTurns.schedule,
              presentation: reconcileSchedulePlan(plan, tasks),
            };
          },
          publish: (value) =>
            setSurfaceTurns((current) => ({ ...current, schedule: value })),
          errorMessage: "לא הצלחנו לשמור את הלוז.",
        },
        surfaceFailure("save"),
      );
    } finally {
      input.setBusy(false);
      setOperation(null);
    }
  }

  async function respondToScheduleProposal(action: "approve" | "reject") {
    const proposal = surfaceTurns.schedule.proposal;
    if (!proposal || input.busy) return;
    input.setBusy(true);
    setOperation("proposal");
    try {
      await input.mutations.run<SurfaceTurnState>(
        {
          key: `surface-proposal:${proposal.id}:${action}`,
          current: () => surfaceTurns.schedule,
          optimistic: (snapshot) => ({
            ...snapshot,
            proposal: snapshot.proposal
              ? { ...snapshot.proposal, status: "executing" }
              : null,
          }),
          commit: async () => {
            const response = await authFetch(`/api/proposals/${action}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: proposal.id }),
            });
            const body = await response.json().catch(() => ({}));
            if (
              response.status === 401 ||
              isAccountAccessDenied(response.status, body.error)
            ) {
              input.onUnauthorized();
              throw new Error("unauthorized");
            }
            if (!response.ok) throw new Error("proposal_failed");
            if (Array.isArray(body.tasks)) input.publishTasks(body.tasks);
            return {
              ...surfaceTurns.schedule,
              proposal: {
                ...proposal,
                status: action === "approve" ? "approved" : "rejected",
                result_reply:
                  action === "approve"
                    ? body.reply ?? proposal.result_reply
                    : null,
              },
            };
          },
          publish: (value) =>
            setSurfaceTurns((current) => ({ ...current, schedule: value })),
          errorMessage: "לא הצלחנו לעדכן את ההצעה.",
        },
        surfaceFailure("proposal"),
      );
    } finally {
      input.setBusy(false);
      setOperation(null);
    }
  }

  return {
    surfaceTurns: {
      ...surfaceTurns,
      focus: surfaceTurns.forgotten,
    },
    operation,
    resetSchedule,
    run,
    saveSchedulePlan,
    respondToScheduleProposal,
  };
}
