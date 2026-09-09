import type { AppState, DailyPlanSession, Task } from "../model";
import { activeFacts, blocked, estimatedMinutes } from "../engine";
import { planForDate } from "./planning/plans";
import { dayKey } from "../time";
import { isActiveVisibleTask } from "./tasks/visibility";
import { isLifeAdminTask } from "./notifications/life-admin";
import { isStampPast, msUntil, stampMs } from "../time";
import type { ForecastModel } from "./forecast";
import { learnedDurationMinutes } from "./learning/pace";

/**
 * Shared structured decision context for WhatForgot / DailyPlan / FreeTime.
 * Engines consume this — they do not interpret natural language.
 */
export type SharedDecisionTaskView = {
  task: Task;
  urgency: number;
  relevance: number;
  feasibility: number;
  dependencyReady: boolean;
  estimatedDuration: number;
  overdue: boolean;
  hoursUntilDue: number | null;
  ageHours: number;
  lifeAdmin: boolean;
  deferred: boolean;
};

export type SharedDecisionContext = {
  now: Date;
  tasks: SharedDecisionTaskView[];
  deferredTaskIds: string[];
  reminders: AppState["reminders"];
  temporaryFacts: AppState["facts"];
  members: AppState["members"];
  plan: DailyPlanSession | null;
  availableMinutes: number | null;
  effort: number | null;
  shoppingOpen: AppState["shopping"];
  actionableForecasts: ForecastModel[];
};

function dependencyReady(task: Task, state: AppState): boolean {
  return !blocked(task, state);
}

function urgencyScore(task: Task, now: Date): number {
  let n = task.priority * 10;
  if (!task.dueAt) return n;
  const hours = msUntil(task.dueAt, now) / 3600000;
  if (hours < 0) n += 100;
  else if (hours < 24) n += 70;
  else if (hours < 72) n += 30;
  return n;
}

function relevanceScore(task: Task, state: AppState): number {
  let n = 0;
  if (task.kind === "idea") n -= 35;
  n +=
    state.tasks.filter(
      (x) => x.status === "open" && x.dependsOn.includes(task.id),
    ).length * 15;
  if (isLifeAdminTask(task)) n += 12;
  return n;
}

function feasibilityScore(
  task: Task,
  state: AppState,
  availableMinutes: number | null,
): number {
  if (!dependencyReady(task, state)) return 0;
  const learned = learnedDurationMinutes(state, task);
  const duration = learned ?? estimatedMinutes(task, state);
  if (availableMinutes == null) return 50;
  if (duration <= availableMinutes) return 80;
  if (duration <= availableMinutes * 1.25) return 40;
  return 10;
}

export function buildSharedDecisionContext(
  state: AppState,
  now: Date = new Date(),
): SharedDecisionContext {
  const plan = planForDate(state, dayKey(now, state.profile.timezone));
  const availableMinutes = plan?.availableMinutes ?? null;
  const effort = plan?.effort ?? state.planning.today?.effort ?? null;

  const tasks: SharedDecisionTaskView[] = state.tasks
    .filter((t) => t.kind === "task")
    .map((task) => {
      const deferred =
        !isActiveVisibleTask(task, now) &&
        (task.status === "open" ||
          task.status === "unknown" ||
          task.status === "in_progress");
      const overdue = Boolean(task.dueAt && isStampPast(task.dueAt, now));
      const hoursUntilDue = task.dueAt
        ? msUntil(task.dueAt, now) / 3600000
        : null;
      const learned = learnedDurationMinutes(state, task);
      return {
        task,
        urgency: urgencyScore(task, now),
        relevance: relevanceScore(task, state),
        feasibility: feasibilityScore(task, state, availableMinutes),
        dependencyReady: dependencyReady(task, state),
        estimatedDuration: learned ?? estimatedMinutes(task, state),
        overdue,
        hoursUntilDue,
        ageHours: (now.getTime() - stampMs(task.createdAt)) / 3600000,
        lifeAdmin: isLifeAdminTask(task),
        deferred,
      };
    });

  return {
    now,
    tasks,
    deferredTaskIds: tasks.filter((t) => t.deferred).map((t) => t.task.id),
    reminders: state.reminders.filter((r) => r.status === "pending"),
    temporaryFacts: activeFacts(state, now).filter(
      (f) => f.kind === "temporary",
    ),
    members: state.members,
    plan,
    availableMinutes,
    effort,
    shoppingOpen: state.shopping.filter((s) => !s.purchasedAt),
    // OLD_FORECAST_REASONING_PATH = DISCONNECTED — LLM decides what to suggest.
    actionableForecasts: [] as ForecastModel[],
  };
}

export function sharedRank(view: SharedDecisionTaskView): number {
  return (
    view.urgency * 2 +
    view.relevance +
    view.feasibility * 0.5 +
    (view.overdue ? 200 : 0) +
    Math.min(40, view.ageHours * 0.15)
  );
}
