import type { Task } from "@/lib/model";
import { isHiddenUntilFuture } from "@/lib/time";

/** True when a task should appear in “relevant now” lists. */
export function isTaskVisibleNow(task: Task, now: Date = new Date()): boolean {
  return !isHiddenUntilFuture(task.hiddenUntil, now);
}

export function isActiveTaskStatus(task: Task): boolean {
  return (
    task.status === "open" ||
    task.status === "unknown" ||
    task.status === "in_progress"
  );
}

/** Active + not deferred past now. */
export function isActiveVisibleTask(
  task: Task,
  now: Date = new Date(),
): boolean {
  return isActiveTaskStatus(task) && isTaskVisibleNow(task, now);
}
