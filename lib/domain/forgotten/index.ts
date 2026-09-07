import type { AppState, Task } from "../../model";
import type { CategoryId } from "../../taxonomy";
import { isActiveVisibleTask } from "../tasks/visibility";
import { isLifeAdminTask } from "../notifications/life-admin";
import {
  buildSharedDecisionContext,
  sharedRank,
  type SharedDecisionContext,
  type SharedDecisionTaskView,
} from "../decision-context";

const ROUTINE: CategoryId[] = [
  "kitchen_dishes",
  "laundry",
  "floors",
  "bathroom_toilets",
  "cleaning_reset",
  "living_spaces",
];

export function isRoutineHousehold(task: Task): boolean {
  return ROUTINE.includes(task.categoryId);
}

export function isRoutineException(
  task: Task,
  state: AppState,
  now: Date,
): boolean {
  if (task.priority >= 3) return true;
  if (task.dueAt) return true;
  if (
    task.categoryId === "laundry" &&
    task.waitMinutes > 0 &&
    task.status === "in_progress"
  )
    return true;
  const dependsOnWaiting = task.dependsOn.some((id) => {
    const d = state.tasks.find((x) => x.id === id);
    return d && d.waitMinutes > 0 && d.status === "done";
  });
  if (dependsOnWaiting && isRoutineHousehold(task)) return true;
  void now;
  return false;
}

function eligibleForgotten(
  view: SharedDecisionTaskView,
  state: AppState,
  now: Date,
): boolean {
  const t = view.task;
  if (!isActiveVisibleTask(t, now)) return false;
  if (t.kind !== "task") return false;
  // Not-today / hiddenUntil already excluded via isActiveVisibleTask.
  if (isLifeAdminTask(t)) return true;
  if (isRoutineHousehold(t)) return isRoutineException(t, state, now);
  return true;
}

function forgottenScore(
  view: SharedDecisionTaskView,
  ctx: SharedDecisionContext,
): number {
  let n = sharedRank(view);
  // Old != urgent: age contributes softly and is capped.
  n += Math.min(45, view.ageHours * 0.18);
  if (view.hoursUntilDue != null && view.hoursUntilDue < 6) n += 80;
  if (view.feasibility < 20) n -= 35;
  if (ctx.temporaryFacts.length && view.lifeAdmin) n += 15;
  if (ctx.reminders.some((r) => r.taskId === view.task.id)) n += 60;
  // Uncertainty → prefer check-in style (unknown status).
  if (view.task.status === "unknown") n += 25;
  return n;
}

export type ForgottenItem = {
  task: Task;
  score: number;
  reasons: string[];
  source: "task" | "reminder";
};

/** Independent of DailyPlan — “מה שכחתי?” */
export function getForgottenCandidates(
  state: AppState,
  now: Date = new Date(),
): Task[] {
  return rankForgotten(state, now, 12)
    .filter((i) => i.source === "task")
    .map((i) => i.task);
}

export function rankForgotten(
  state: AppState,
  now: Date = new Date(),
  limit = 6,
): ForgottenItem[] {
  const ctx = buildSharedDecisionContext(state, now);
  const items: ForgottenItem[] = [];

  for (const view of ctx.tasks) {
    if (!eligibleForgotten(view, state, now)) continue;
    const score = forgottenScore(view, ctx);
    const reasons: string[] = [];
    if (view.overdue) reasons.push("overdue");
    if (view.hoursUntilDue != null && view.hoursUntilDue < 24)
      reasons.push("deadline");
    if (view.lifeAdmin) reasons.push("life_admin");
    if (isRoutineHousehold(view.task)) reasons.push("routine_exception");
    if (view.ageHours > 72) reasons.push("aged");
    if (!view.dependencyReady) reasons.push("dependency");
    if (view.task.status === "unknown") reasons.push("check_in");
    items.push({ task: view.task, score, reasons, source: "task" });
  }

  for (const rem of ctx.reminders) {
    if (!rem.dueAt) continue;
    const hours = (Date.parse(rem.dueAt) - now.getTime()) / 3600000;
    if (hours > 36) continue;
    const linked = rem.taskId
      ? state.tasks.find((t) => t.id === rem.taskId)
      : null;
    if (linked && items.some((i) => i.task.id === linked.id)) continue;
    if (!linked) continue;
    items.push({
      task: linked,
      score: rem.urgency === "urgent" ? 900 : hours < 0 ? 800 : 500,
      reasons: ["reminder"],
      source: "reminder",
    });
  }

  // No overload: hard cap at limit (default 5–6).
  return items.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function whatForgotNow(state: AppState, now: Date = new Date()): Task[] {
  return rankForgotten(state, now, 6)
    .filter((i) => i.source === "task" || i.source === "reminder")
    .map((i) => i.task);
}
