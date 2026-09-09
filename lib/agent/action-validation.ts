import { applyActions } from "../engine";
import type { Action, AppState } from "../model";
import { orderActionsForApply } from "../domain/planning/plan-intent";

/**
 * Validate a composed action list against an evolving temporary state.
 *
 * Action B is allowed to depend on Action A from the same agent turn
 * (for example: create a task, then attach a reminder to that new task).
 * The domain still remains the authority on legality; this helper only
 * preserves the semantics of an ordered action batch instead of validating
 * every action against the original pre-turn state in isolation.
 */
export function filterRunnableActions(
  state: AppState,
  actions: Action[],
  now: Date,
) {
  const ordered = orderActionsForApply(actions);
  try {
    applyActions(state, ordered, now, true);
    return { accepted: ordered, rejected: [] as Action[] };
  } catch {
    /* fall through to per-action, then drop unpaired creates */
  }

  const accepted: Action[] = [];
  const rejected: Action[] = [];
  let simulated = state;

  for (const action of ordered) {
    try {
      simulated = applyActions(simulated, [action], now, true);
      accepted.push(action);
    } catch {
      rejected.push(action);
    }
  }

  const rejectedScheduleIds = new Set(
    rejected
      .filter(
        (action): action is Extract<Action, { type: "schedule.set" }> =>
          action.type === "schedule.set",
      )
      .map((action) => action.taskId)
      .filter((id): id is string => Boolean(id)),
  );
  const kept: Action[] = [];
  for (const action of accepted) {
    if (
      action.type === "task.create" &&
      action.task.id &&
      rejectedScheduleIds.has(action.task.id)
    ) {
      rejected.push(action);
      continue;
    }
    kept.push(action);
  }
  return { accepted: kept, rejected };
}
