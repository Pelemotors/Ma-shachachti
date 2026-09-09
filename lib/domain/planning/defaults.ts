import type { AppState } from "@/lib/model";
import { dayContextForDate } from "./day-context";

/**
 * Product defaults when a date has no stored day context capacity.
 * These are documented fallbacks — not a claim that this is "the user's whole day".
 */

export const DEFAULT_PLAN_AVAILABLE_MINUTES = 120;
export const DEFAULT_PLAN_EFFORT = 2 as const;

export function resolvePlanCapacity(state: {
  planning: AppState["planning"];
  dateKey?: string;
}): { minutes: number; effort: 1 | 2 | 3 } {
  const today = state.dateKey
    ? dayContextForDate(state as AppState, state.dateKey)
    : null;
  let minutes = DEFAULT_PLAN_AVAILABLE_MINUTES;
  if (today?.availableFrom && today?.availableUntil) {
    const ms =
      Date.parse(today.availableUntil) - Date.parse(today.availableFrom);
    if (Number.isFinite(ms) && ms > 0) {
      minutes = Math.max(15, Math.min(24 * 60, Math.round(ms / 60000)));
    }
  }
  const effortRaw = today?.effort ?? DEFAULT_PLAN_EFFORT;
  const effort = Math.min(3, Math.max(1, effortRaw)) as 1 | 2 | 3;
  return { minutes, effort };
}
