import { applyActions } from "../engine";
import type { Action, AppState } from "../model";

export function filterRunnableActions(
  state: AppState,
  actions: Action[],
  now: Date,
) {
  const accepted: Action[] = [];
  const rejected: Action[] = [];
  for (const action of actions) {
    try {
      applyActions(state, [action], now, true);
      accepted.push(action);
    } catch {
      rejected.push(action);
    }
  }
  return { accepted, rejected };
}
