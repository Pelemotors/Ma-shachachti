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
  const accepted: Action[] = [];
  const rejected: Action[] = [];
  let simulated = state;

  for (const action of orderActionsForApply(actions)) {
    try {
      simulated = applyActions(simulated, [action], now, true);
      accepted.push(action);
    } catch {
      rejected.push(action);
    }
  }

  return { accepted, rejected };
}
