import type { Action } from "@/lib/model";
import { dayKey } from "@/lib/time";

/** Ensure every task.create carries a server-stable UUID before proposal persist. */
export function stampTaskCreateIds(actions: Action[]): Action[] {
  return actions.map((action) => {
    if (action.type !== "task.create") return action;
    if (action.task.id) return action;
    return {
      ...action,
      task: { ...action.task, id: crypto.randomUUID() },
    };
  });
}

/**
 * Resolve which create IDs are explicitly requested for today's plan.
 * Indexes (when present) refer to task.create actions in order within `actions`.
 * If affectsToday and indexes omitted → all stamped creates.
 */
export function resolveRequestedTodayTaskIds(input: {
  actions: Action[];
  affectsToday: boolean;
  requestedTodayCreateIndexes?: number[] | null;
  existingIds?: string[];
}): string[] {
  if (input.existingIds?.length && !input.affectsToday) {
    return [...new Set(input.existingIds)];
  }
  const creates = input.actions.filter(
    (a): a is Extract<Action, { type: "task.create" }> =>
      a.type === "task.create" && Boolean(a.task.id),
  );
  if (!input.affectsToday && !input.existingIds?.length) return [];

  const indexes = input.requestedTodayCreateIndexes;
  if (indexes && indexes.length > 0) {
    const picked = indexes
      .filter((i) => i >= 0 && i < creates.length)
      .map((i) => creates[i].task.id!)
      .filter(Boolean);
    return [...new Set(picked)];
  }

  if (input.affectsToday) {
    return [...new Set(creates.map((c) => c.task.id!).filter(Boolean))];
  }
  return [...new Set(input.existingIds ?? [])];
}

export function taskCreateRelevantToToday(
  action: Extract<Action, { type: "task.create" }>,
  now: Date,
  timezone: string,
  requestedTodayTaskIds: ReadonlySet<string>,
): boolean {
  const id = action.task.id;
  if (id && requestedTodayTaskIds.has(id)) return true;
  const today = dayKey(now, timezone);
  if (action.task.dueAt) {
    const dueDay = dayKey(new Date(action.task.dueAt), timezone);
    if (dueDay === today) return true;
  }
  const win = action.task.preferredWindow;
  if (win?.start) {
    const startDay = dayKey(new Date(win.start), timezone);
    if (startDay === today) return true;
  }
  if (win?.end) {
    const endDay = dayKey(new Date(win.end), timezone);
    if (endDay === today) return true;
  }
  return false;
}

export function countPlannedCreates(
  newTaskIds: string[],
  planItems: { taskId: string }[] | null | undefined,
): number {
  if (!planItems?.length || !newTaskIds.length) return 0;
  const inPlan = new Set(planItems.map((i) => i.taskId));
  return newTaskIds.filter((id) => inPlan.has(id)).length;
}
