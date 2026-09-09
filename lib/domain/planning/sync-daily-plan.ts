import type { Action, AppState } from "@/lib/model";

/**
 * After actions persist, do not choose or rebuild a DailyPlan.
 * Placement is written only by schedule.* / plan.set from the caller.
 */
export function actionAffectsDailyPlan(action: Action): boolean {
  return (
    action.type === "schedule.set" ||
    action.type === "schedule.remove" ||
    action.type === "schedule.replaceDay" ||
    action.type === "plan.set" ||
    action.type === "plan.clear" ||
    action.type === "plan.itemUpdate"
  );
}

export function syncDailyPlanAfterActions(input: {
  state: AppState;
  actions: Action[];
  affectsToday?: boolean;
  requestedTodayTaskIds?: string[];
  authorizeBroadReplan?: boolean;
  now?: Date;
  revision?: number;
}): {
  state: AppState;
  planSynced: boolean;
  planSyncFailed: boolean;
  requiresProposal?: boolean;
  notice?: string;
} {
  const wroteSchedule = input.actions.some(actionAffectsDailyPlan);
  return {
    state: input.state,
    planSynced: wroteSchedule,
    planSyncFailed: false,
  };
}
