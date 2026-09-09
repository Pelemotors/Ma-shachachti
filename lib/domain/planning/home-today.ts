import type { AppState, Task } from "@/lib/model";
import { activeDailyPlan, whatMatters } from "@/lib/engine";
import { isActiveVisibleTask } from "@/lib/domain/tasks/visibility";
import { visiblePlanItems } from "./schedule-day";

/**
 * Home schedule source of truth: active DailyPlan when present, else whatMatters.
 * Does not slice — callers may choose fold presentation without truncating the source.
 */
export function getHomeTodayTasks(
  state: AppState,
  now: Date = new Date(),
): { tasks: Task[]; source: "daily_plan" | "what_matters" } {
  const plan = activeDailyPlan(state, now);
  if (plan?.items.length) {
    const byId = new Map(state.tasks.map((t) => [t.id, t]));
    const tasks = visiblePlanItems(plan)
      .map((item) => byId.get(item.taskId))
      .filter((t): t is Task => Boolean(t))
      .filter((t) => t.status !== "cancelled")
      .filter(
        (t) =>
          t.status === "done" ||
          t.status === "in_progress" ||
          isActiveVisibleTask(t, now),
      );
    if (tasks.length) return { tasks, source: "daily_plan" };
  }
  return {
    tasks: whatMatters(state, now),
    source: "what_matters",
  };
}

/** Compact home fold — does not change the DailyPlan source of truth. */
export function foldHomeTodayTasks(
  tasks: Task[],
  source: "daily_plan" | "what_matters",
  limit = 3,
): Task[] {
  if (source !== "daily_plan") return tasks.slice(0, 6);
  const upcoming = tasks.filter((task) => task.status !== "done");
  return (upcoming.length ? upcoming : tasks).slice(0, limit);
}
