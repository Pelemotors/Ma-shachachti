/**
 * Product defaults for building a DailyPlan when no planning.today capacity is set.
 * These are documented fallbacks — not a claim that this is "the user's whole day".
 */
export const DEFAULT_PLAN_AVAILABLE_MINUTES = 120;
export const DEFAULT_PLAN_EFFORT = 2 as const;

export function resolvePlanCapacity(state: {
  planning: {
    today: {
      effort: number | null;
      availableFrom: string | null;
      availableUntil: string | null;
    } | null;
  };
}): { minutes: number; effort: 1 | 2 | 3 } {
  const today = state.planning.today;
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
