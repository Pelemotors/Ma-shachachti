import type { Action, AppState } from "@/lib/model";
import {
  activeDailyPlan,
  applyActions,
  buildDailyPlanSession,
  replanDailyPlan,
} from "@/lib/engine";

export function actionAffectsDailyPlan(action: Action): boolean {
  switch (action.type) {
    case "task.create":
    case "task.status":
    case "task.start":
    case "task.defer":
    case "task.deferUntil":
    case "planning.set":
    case "planning.clear":
      return true;
    case "task.update": {
      const p = action.patch;
      return Boolean(
        p.dueAt !== undefined ||
          p.workMinutes !== undefined ||
          p.waitMinutes !== undefined ||
          p.effort !== undefined ||
          p.priority !== undefined ||
          p.dependsOn !== undefined,
      );
    }
    default:
      return false;
  }
}

export function syncDailyPlanAfterActions(input: {
  state: AppState;
  actions: Action[];
  affectsToday?: boolean;
  now?: Date;
  revision?: number;
}): {
  state: AppState;
  planSynced: boolean;
  planSyncFailed: boolean;
  notice?: string;
} {
  const now = input.now ?? new Date();
  const affectsToday = input.affectsToday ?? false;
  const needsSync =
    affectsToday || input.actions.some(actionAffectsDailyPlan);
  if (!needsSync) {
    return { state: input.state, planSynced: false, planSyncFailed: false };
  }

  try {
    const existing = activeDailyPlan(input.state, now);
    if (existing) {
      const { plan } = replanDailyPlan(input.state, now);
      if (!plan) {
        return { state: input.state, planSynced: false, planSyncFailed: false };
      }
      const next = applyActions(
        input.state,
        [{ type: "plan.set", plan }],
        now,
        true,
      );
      return { state: next, planSynced: true, planSyncFailed: false };
    }

    if (!affectsToday) {
      return { state: input.state, planSynced: false, planSyncFailed: false };
    }

    const revision = input.revision ?? 0;
    const session = buildDailyPlanSession(input.state, 120, 2, revision, now);
    const next = applyActions(
      input.state,
      [{ type: "plan.set", plan: session }],
      now,
      true,
    );
    return { state: next, planSynced: true, planSyncFailed: false };
  } catch {
    return {
      state: input.state,
      planSynced: false,
      planSyncFailed: true,
      notice: "המשימות נשמרו אבל הלו״ז לא עודכן.",
    };
  }
}
