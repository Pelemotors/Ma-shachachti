import type { Action, AppState } from "@/lib/model";
import {
  activeDailyPlan,
  applyActions,
  buildDailyPlanSession,
  replanDailyPlan,
} from "@/lib/engine";
import { resolvePlanCapacity } from "./defaults";
import { taskCreateRelevantToToday } from "./plan-intent";

export function actionAffectsDailyPlan(
  action: Action,
  opts?: {
    requestedTodayTaskIds?: ReadonlySet<string>;
    timezone?: string;
    now?: Date;
  },
): boolean {
  const now = opts?.now ?? new Date();
  const tz = opts?.timezone ?? "Asia/Jerusalem";
  const requested = opts?.requestedTodayTaskIds ?? new Set<string>();

  switch (action.type) {
    case "task.create":
      return taskCreateRelevantToToday(action, now, tz, requested);
    case "task.status":
    case "task.start":
    case "task.defer":
    case "task.deferUntil":
    case "planning.set":
    case "planning.clear":
    case "plan.set":
    case "plan.clear":
      return true;
    case "schedule.set":
    case "schedule.remove":
      return false;
    case "task.update": {
      const p = action.patch;
      return Boolean(
        p.dueAt !== undefined ||
        p.workMinutes !== undefined ||
        p.waitMinutes !== undefined ||
        p.effort !== undefined ||
        p.priority !== undefined ||
        p.dependsOn !== undefined ||
        p.preferredWindow !== undefined,
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
  requestedTodayTaskIds?: string[];
  /** Explicit broad today intent authorizes silent replan even if requiresProposal. */
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
  const now = input.now ?? new Date();
  const affectsToday = input.affectsToday ?? false;
  const requestedTodayTaskIds = [...new Set(input.requestedTodayTaskIds ?? [])];
  const requestedSet = new Set(requestedTodayTaskIds);
  const authorizeBroad =
    input.authorizeBroadReplan ??
    (affectsToday && requestedTodayTaskIds.length > 0);

  if (
    input.actions.some(
      (action) =>
        action.type === "schedule.set" || action.type === "schedule.remove",
    )
  ) {
    return { state: input.state, planSynced: true, planSyncFailed: false };
  }

  const needsSync =
    affectsToday ||
    requestedTodayTaskIds.length > 0 ||
    input.actions.some((a) =>
      actionAffectsDailyPlan(a, {
        requestedTodayTaskIds: requestedSet,
        timezone: input.state.profile.timezone,
        now,
      }),
    );
  if (!needsSync) {
    return { state: input.state, planSynced: false, planSyncFailed: false };
  }

  const planOpts = { requestedTodayTaskIds: requestedSet };

  try {
    const existing = activeDailyPlan(input.state, now);
    if (existing) {
      const { plan, requiresProposal } = replanDailyPlan(
        input.state,
        now,
        planOpts,
      );
      if (!plan) {
        return { state: input.state, planSynced: false, planSyncFailed: false };
      }
      if (requiresProposal && !authorizeBroad) {
        return {
          state: input.state,
          planSynced: false,
          planSyncFailed: false,
          requiresProposal: true,
          notice:
            "המשימות נשמרו. עדכון הלו״ז גדול ודורש אישור נפרד לפני שינוי.",
        };
      }
      const next = applyActions(
        input.state,
        [{ type: "plan.set", plan }],
        now,
        true,
      );
      return { state: next, planSynced: true, planSyncFailed: false };
    }

    if (!affectsToday && requestedTodayTaskIds.length === 0) {
      return { state: input.state, planSynced: false, planSyncFailed: false };
    }

    const revision = input.revision ?? 0;
    const { minutes, effort } = resolvePlanCapacity(input.state);
    const session = buildDailyPlanSession(
      input.state,
      minutes,
      effort,
      revision,
      now,
      planOpts,
    );
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
