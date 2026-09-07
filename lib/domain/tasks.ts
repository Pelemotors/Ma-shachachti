import type { AppState, Task } from "../model";
import {
  estimatedMinutes,
  shouldAskWorkTime,
  score,
  followUps,
  blocked,
} from "../engine";
import {
  isActiveVisibleTask,
  isTaskVisibleNow,
  isActiveTaskStatus,
} from "./tasks/visibility";

export {
  estimatedMinutes,
  shouldAskWorkTime,
  score,
  followUps,
  blocked,
  isActiveVisibleTask,
  isTaskVisibleNow,
  isActiveTaskStatus,
};

/** Prefer domain visibility; keep engine `visible` semantics via re-export after align. */
export { visible } from "../engine";

export function openTasks(state: AppState, now = new Date()): Task[] {
  return state.tasks.filter((t) => isActiveVisibleTask(t, now));
}

export function whatMatters(s: AppState, now = new Date()) {
  return s.tasks
    .filter((t) => isActiveVisibleTask(t, now) && t.kind === "task")
    .sort((a, b) => score(b, s, now) - score(a, s, now))
    .slice(0, 6);
}
