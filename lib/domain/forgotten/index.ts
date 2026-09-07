import type { AppState, Task } from "../../model";
import { isActiveVisibleTask } from "../tasks/visibility";
import { score } from "../../engine";
import type { CategoryId } from "../../taxonomy";
import { isLifeAdminTask } from "../notifications/life-admin";
import { isStampPast, msUntil, stampMs } from "../../time";

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
  // Wet laundry / wait stage waiting
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

function forgottenRank(task: Task, state: AppState, now: Date): number {
  let n = 0;
  if (task.dueAt && isStampPast(task.dueAt, now)) n += 1000;
  else if (task.dueAt) {
    const hours = msUntil(task.dueAt, now) / 3600000;
    n += hours < 24 ? 700 : hours < 72 ? 400 : 100;
  }
  if (task.priority >= 3) n += 500;
  else if (task.priority >= 2) n += 200;
  n += score(task, state, now);
  const ageHours = (now.getTime() - stampMs(task.createdAt)) / 3600000;
  n += Math.min(50, ageHours);
  return n;
}

/** Independent of DailyPlan — “מה שכחתי?” */
export function getForgottenCandidates(
  state: AppState,
  now: Date = new Date(),
): Task[] {
  return state.tasks
    .filter((t) => isActiveVisibleTask(t, now) && t.kind === "task")
    .filter((t) => {
      if (isLifeAdminTask(t)) return true;
      if (isRoutineHousehold(t)) return isRoutineException(t, state, now);
      // Non-routine non-admin still eligible (errands-like unclassified etc.)
      return !isRoutineHousehold(t);
    })
    .sort((a, b) => forgottenRank(b, state, now) - forgottenRank(a, state, now))
    .slice(0, 12);
}
