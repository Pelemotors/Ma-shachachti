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
  // Prefer already-resolved server IDs (survives re-stamp / re-persist).
  if (input.existingIds?.length) {
    return [...new Set(input.existingIds)];
  }
  const creates = input.actions.filter(
    (a): a is Extract<Action, { type: "task.create" }> =>
      a.type === "task.create" && Boolean(a.task.id),
  );
  if (!input.affectsToday) return [];

  const indexes = input.requestedTodayCreateIndexes;
  if (indexes && indexes.length > 0) {
    const picked = indexes
      .filter((i) => i >= 0 && i < creates.length)
      .map((i) => creates[i].task.id!)
      .filter(Boolean);
    return [...new Set(picked)];
  }

  return [...new Set(creates.map((c) => c.task.id!).filter(Boolean))];
}

/** Truthful post-approve notices — never claim plan placement without exact taskId. */
export function buildApproveTaskNotice(input: {
  appliedCount: number;
  skippedCount: number;
  todayIntent: boolean;
  plannedCreates: number;
  planSyncFailed?: boolean;
  requiresProposal?: boolean;
  syncedNotice?: string;
}): string {
  const { appliedCount, skippedCount, todayIntent, plannedCreates } = input;
  if (input.planSyncFailed) {
    return appliedCount > 0
      ? appliedCount === 1
        ? "נוספה משימה. הלו״ז לא עודכן."
        : `נוספו ${appliedCount} משימות. הלו״ז לא עודכן.`
      : "המשימות נשמרו אבל הלו״ז לא עודכן.";
  }
  if (input.requiresProposal) {
    return appliedCount > 0
      ? `${appliedCount === 1 ? "נוספה משימה." : `נוספו ${appliedCount} משימות.`} ${input.syncedNotice ?? "עדכון הלו״ז דורש אישור."}`
      : (input.syncedNotice ?? "");
  }
  if (appliedCount && skippedCount) {
    return `נוספו ${appliedCount} משימות. ${skippedCount} כבר היו ברשימה.`;
  }
  if (appliedCount && todayIntent) {
    if (plannedCreates <= 0) {
      return appliedCount === 1
        ? "המשימה נשמרה, אבל לא נכנסה כרגע ללו״ז של היום."
        : "המשימות נשמרו, אבל לא נכנסו כרגע ללו״ז של היום.";
    }
    if (plannedCreates >= appliedCount) {
      return appliedCount === 1
        ? "נוספה משימה ללו״ז של היום."
        : `נוספו ${appliedCount} משימות ללו״ז של היום.`;
    }
    return `נוספו ${appliedCount} משימות. ${plannedCreates} נכנסו ללו״ז של היום והשאר נשארו להמשך.`;
  }
  if (appliedCount) {
    return appliedCount === 1
      ? "נוספה משימה."
      : `נוספו ${appliedCount} משימות.`;
  }
  if (skippedCount) {
    return skippedCount === 1
      ? "המשימה כבר הייתה ברשימה."
      : `${skippedCount} משימות כבר היו ברשימה.`;
  }
  return "";
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
