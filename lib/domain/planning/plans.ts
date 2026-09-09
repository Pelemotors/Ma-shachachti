import type {
  AppState,
  DailyPlanItem,
  DailyPlanSession,
} from "@/lib/model";
import { dayKey } from "@/lib/time";

export type ScheduleDayPart = "morning" | "afternoon" | "evening";

/** Canonical daily-plan collection. Never read a leftover `planning.plan`. */
export function planningPlans(
  state: AppState,
): Record<string, DailyPlanSession> {
  return state.planning.plans ?? {};
}

export function planForDate(
  state: AppState,
  dateKey: string,
): DailyPlanSession | null {
  return planningPlans(state)[dateKey] ?? null;
}

export function ensurePlanningPlans(
  state: AppState,
): Record<string, DailyPlanSession> {
  if (!state.planning.plans) state.planning.plans = {};
  return state.planning.plans;
}

export function writeDailyPlan(state: AppState, plan: DailyPlanSession) {
  ensurePlanningPlans(state)[plan.date] = plan;
}

export function deleteDailyPlan(state: AppState, dateKey: string) {
  delete ensurePlanningPlans(state)[dateKey];
}

export function findPlanDateForTask(
  state: AppState,
  taskId: string,
  preferDate?: string | null,
): string | null {
  const plans = planningPlans(state);
  if (
    preferDate &&
    plans[preferDate]?.items.some((item) => item.taskId === taskId)
  ) {
    return preferDate;
  }
  for (const [date, plan] of Object.entries(plans)) {
    if (plan.items.some((item) => item.taskId === taskId)) return date;
  }
  return null;
}

export function forEachPlanItem(
  state: AppState,
  taskId: string,
  visit: (plan: DailyPlanSession, item: DailyPlanItem) => void,
) {
  for (const plan of Object.values(ensurePlanningPlans(state))) {
    const item = plan.items.find((row) => row.taskId === taskId);
    if (item) visit(plan, item);
  }
}

export function createEmptyDailyPlan(
  date: string,
  stamp: string,
  opts?: {
    availableMinutes?: number;
    effort?: number;
    generatedFromRevision?: number;
  },
): DailyPlanSession {
  return {
    id: crypto.randomUUID(),
    date,
    createdAt: stamp,
    updatedAt: stamp,
    availableMinutes: opts?.availableMinutes ?? 120,
    effort: opts?.effort ?? 2,
    generatedFromRevision: opts?.generatedFromRevision ?? 0,
    items: [],
  };
}

export function removeTaskFromDate(
  state: AppState,
  taskId: string,
  dateKey: string,
  stamp: string,
) {
  const plan = ensurePlanningPlans(state)[dateKey];
  if (!plan) return;
  plan.items = plan.items.filter((item) => item.taskId !== taskId);
  plan.updatedAt = stamp;
}

export function removeTaskFromOtherDates(
  state: AppState,
  taskId: string,
  keepDate: string,
  stamp: string,
) {
  for (const date of Object.keys(ensurePlanningPlans(state))) {
    if (date === keepDate) continue;
    removeTaskFromDate(state, taskId, date, stamp);
  }
}

export function openCommitmentCount(state: AppState): number {
  return state.tasks.filter(
    (task) =>
      task.status === "open" ||
      task.status === "in_progress" ||
      task.status === "unknown",
  ).length;
}

export function todayDateKey(state: AppState, now = new Date()): string {
  return dayKey(now, state.profile.timezone);
}
