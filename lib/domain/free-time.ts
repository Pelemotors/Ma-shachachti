import type { AppState } from "../model";
import { freeTimeV2, opportunities } from "../engine";
import {
  buildSharedDecisionContext,
  type SharedDecisionContext,
} from "./decision-context";

export type FreeTimeInput = {
  state: AppState;
  duration: number;
  effort: number;
  now?: Date;
};

/**
 * Free-time engine consumes structured state/context only — no NLP.
 * Feasibility uses shared learned/default durations via SharedDecisionContext.
 */
export function freeTime(input: FreeTimeInput) {
  const now = input.now ?? new Date();
  const ctx = buildSharedDecisionContext(input.state, now);
  const result = freeTimeV2(
    input.state,
    input.duration,
    input.effort,
    now,
  );
  const feasibleIds = new Set(
    ctx.tasks
      .filter(
        (t) =>
          t.dependencyReady &&
          t.task.effort <= input.effort &&
          t.estimatedDuration <= input.duration &&
          !t.deferred,
      )
      .map((t) => t.task.id),
  );
  const filterFeasible = <T extends { id: string }>(list: T[]) =>
    list.filter((t) => feasibleIds.has(t.id));

  return {
    urgent: filterFeasible(result.closeFirst),
    opportunities: filterFeasible(result.outsidePlan),
    closeFirst: filterFeasible(result.closeFirst),
    outsidePlan: filterFeasible(result.outsidePlan),
    context: ctx as SharedDecisionContext,
  };
}

export { freeTimeV2, opportunities, buildSharedDecisionContext };
