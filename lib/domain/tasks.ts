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
import { buildSharedDecisionContext, sharedRank } from "./decision-context";

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

/** Shared ranking with DailyPlan / FreeTime / WhatForgot. */
export function whatMatters(s: AppState, now = new Date()) {
  const ctx = buildSharedDecisionContext(s, now);
  return ctx.tasks
    .filter((v) => isActiveVisibleTask(v.task, now) && v.task.kind === "task")
    .sort((a, b) => sharedRank(b) - sharedRank(a))
    .slice(0, 6)
    .map((v) => v.task);
}
