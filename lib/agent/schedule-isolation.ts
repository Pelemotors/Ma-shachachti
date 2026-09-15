import type { AgentAction, ClientPresentation, TaskRow } from "../types.ts";
import { TIME_RE, jerusalemParts } from "../time.ts";
import type { MemoryRow } from "../types.ts";
import {
  DEFAULT_DAY_END,
  DEFAULT_DAY_START,
} from "../chat-request.ts";

/** Actions that mutate committed planned schedule state. */
export function isCommittedScheduleMutation(action: AgentAction): boolean {
  if (action.type === "task.reschedule") return true;
  if (action.plan_patch === "set" || action.plan_patch === "clear") return true;
  if (
    action.type === "task.update" &&
    (action.planned_start_time != null ||
      action.planned_end_time != null ||
      action.planned_date != null)
  ) {
    return true;
  }
  if (action.type === "task.create" && action.planned_start_time != null) {
    return true;
  }
  return false;
}

function titleKey(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function titlesRelated(a: string, b: string) {
  const left = titleKey(a);
  const right = titleKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 4 && right.includes(left)) return true;
  if (right.length >= 4 && left.includes(right)) return true;
  return false;
}

/** Timing edits that target entities already present on the pending plan. */
export function touchesPendingScheduleEntity(
  action: AgentAction,
  pending: Extract<ClientPresentation, { type: "schedule_plan" }>,
): boolean {
  if (action.id && pending.items.some((item) => item.task_id === action.id)) {
    return true;
  }
  if (
    action.title &&
    pending.items.some((item) => titlesRelated(item.title, action.title!))
  ) {
    return true;
  }
  return false;
}

export function isPendingScheduleRevisionMutation(
  action: AgentAction,
  pending: Extract<ClientPresentation, { type: "schedule_plan" }>,
): boolean {
  if (isCommittedScheduleMutation(action)) return true;
  if (!touchesPendingScheduleEntity(action, pending)) return false;
  // Preference corrections often arrive as due/time patches on plan entities.
  if (
    action.type === "task.update" ||
    action.type === "task.create" ||
    action.type === "task.reschedule"
  ) {
    return (
      action.due_on != null ||
      action.due_time != null ||
      action.due_patch === "set" ||
      action.due_patch === "clear" ||
      action.planned_end_time != null
    );
  }
  return false;
}

export function isUnrelatedToSchedule(action: AgentAction): boolean {
  return (
    action.type.startsWith("shopping.") ||
    action.type.startsWith("checklist.") ||
    action.type.startsWith("memory.") ||
    (action.type === "task.create" &&
      action.plan_patch == null &&
      action.planned_start_time == null &&
      action.planned_end_time == null) ||
    action.type === "task.complete" ||
    action.type === "task.delete" ||
    action.type === "task.reopen"
  );
}

/**
 * A draft is still pending when presentation.saved is false AND the planned
 * slots are not already reflected on the tasks (post-/api/tasks/plan).
 */
export function isScheduleDraftPending(
  plan: Extract<ClientPresentation, { type: "schedule_plan" }>,
  tasks: TaskRow[],
): boolean {
  if (plan.saved) return false;
  const byId = new Map(tasks.map((task) => [task.id, task]));
  let linked = 0;
  let matched = 0;
  for (const item of plan.items) {
    if (!item.task_id) continue;
    linked += 1;
    const task = byId.get(item.task_id);
    if (!task?.planned_start_at) continue;
    const parts = jerusalemParts(task.planned_start_at);
    if (parts.date === plan.date && parts.time === item.planned_start) {
      matched += 1;
    }
  }
  if (linked > 0 && matched === linked) return false;
  return true;
}

/**
 * While a schedule_plan proposal is pending (unsaved), strip actions that would
 * commit planned times into the real task DB. Unrelated mutations stay.
 */
export function isolatePendingScheduleActions(input: {
  actions: AgentAction[];
  pendingSchedule: Extract<
    ClientPresentation,
    { type: "schedule_plan" }
  > | null;
  tasks?: TaskRow[];
}): { actions: AgentAction[]; strippedScheduleMutations: number } {
  if (!input.pendingSchedule) {
    return { actions: input.actions, strippedScheduleMutations: 0 };
  }
  if (
    input.tasks &&
    !isScheduleDraftPending(input.pendingSchedule, input.tasks)
  ) {
    return { actions: input.actions, strippedScheduleMutations: 0 };
  }
  if (input.pendingSchedule.saved) {
    return { actions: input.actions, strippedScheduleMutations: 0 };
  }
  const kept: AgentAction[] = [];
  let stripped = 0;
  for (const action of input.actions) {
    if (isPendingScheduleRevisionMutation(action, input.pendingSchedule)) {
      stripped += 1;
      continue;
    }
    kept.push(action);
  }
  return { actions: kept, strippedScheduleMutations: stripped };
}

export function findPendingSchedulePresentation(
  presentations: Array<ClientPresentation | null | undefined>,
): Extract<ClientPresentation, { type: "schedule_plan" }> | null {
  for (const presentation of presentations) {
    if (
      presentation?.type === "schedule_plan" &&
      presentation.saved === false &&
      presentation.items.length > 0
    ) {
      return presentation;
    }
  }
  return null;
}

/**
 * Resolve day bounds from memory preferences when they contain explicit HH:MM ranges.
 * Does not use domain keywords — only clock patterns in preference text.
 */
export function resolveDayBoundsFromMemory(
  memories: MemoryRow[],
  fallback: { day_start: string; day_end: string } = {
    day_start: DEFAULT_DAY_START,
    day_end: DEFAULT_DAY_END,
  },
): { day_start: string; day_end: string; source: "memory" | "default" } {
  for (const memory of memories) {
    if (memory.kind !== "preference") continue;
    const times = memory.content.match(/\b([01]\d|2[0-3]):[0-5]\d\b/g);
    if (!times || times.length < 2) continue;
    const day_start = times[0];
    const day_end = times[1];
    if (
      TIME_RE.test(day_start) &&
      TIME_RE.test(day_end) &&
      day_end > day_start
    ) {
      return { day_start, day_end, source: "memory" };
    }
  }
  return { ...fallback, source: "default" };
}

/** Drop schedule slots that start in the past for today. */
export function filterFutureScheduleItems<
  T extends { planned_start: string },
>(input: {
  date: string;
  today: string;
  currentTime: string;
  items: T[];
}): T[] {
  return input.items.filter((item) => {
    if (input.date !== input.today) return true;
    return item.planned_start >= input.currentTime;
  });
}

export function tasksUnchangedByPlan(
  before: TaskRow[],
  after: TaskRow[],
): boolean {
  if (before.length !== after.length) return false;
  const byId = new Map(after.map((task) => [task.id, task]));
  for (const task of before) {
    const next = byId.get(task.id);
    if (!next) return false;
    if (
      task.planned_start_at !== next.planned_start_at ||
      task.planned_end_at !== next.planned_end_at ||
      task.title !== next.title ||
      task.status !== next.status
    ) {
      return false;
    }
  }
  return true;
}
