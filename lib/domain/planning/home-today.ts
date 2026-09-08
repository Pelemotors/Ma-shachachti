import type { AppState, Task } from "@/lib/model";
import { activeDailyPlan, whatMatters } from "@/lib/engine";
import { isActiveVisibleTask } from "@/lib/domain/tasks/visibility";

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
    const tasks = [...plan.items]
      .sort((a, b) => a.order - b.order)
      .map((item) => byId.get(item.taskId))
      .filter((t): t is Task => Boolean(t))
      .filter((t) => t.status !== "cancelled")
      .filter(
        (t) =>
          t.status === "done" ||
          t.status === "in_progress" ||
          isActiveVisibleTask(t, now),
      );
    return { tasks, source: "daily_plan" };
  }
  return {
    tasks: whatMatters(state, now),
    source: "what_matters",
  };
}
