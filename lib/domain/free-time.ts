import type { AppState } from "../model";
import { freeTimeV2, opportunities } from "../engine";

export type FreeTimeInput = {
  state: AppState;
  duration: number;
  effort: number;
  now?: Date;
};

export function freeTime(input: FreeTimeInput) {
  const result = freeTimeV2(
    input.state,
    input.duration,
    input.effort,
    input.now,
  );
  return {
    urgent: result.closeFirst,
    opportunities: result.outsidePlan,
    closeFirst: result.closeFirst,
    outsidePlan: result.outsidePlan,
  };
}

export { freeTimeV2, opportunities };
