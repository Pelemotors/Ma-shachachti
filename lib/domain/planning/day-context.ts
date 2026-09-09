import type { AppState, PlanningDayContext } from "@/lib/model";

export function dayContexts(
  state: AppState,
): Record<string, PlanningDayContext> {
  return state.planning.dayContexts ?? {};
}

export function dayContextForDate(
  state: AppState,
  dateKey: string,
): PlanningDayContext | null {
  return dayContexts(state)[dateKey] ?? null;
}

export function writeDayContext(
  state: AppState,
  context: PlanningDayContext,
) {
  if (!state.planning.dayContexts) state.planning.dayContexts = {};
  state.planning.dayContexts[context.date] = context;
}

export function clearDayContext(state: AppState, dateKey: string) {
  if (!state.planning.dayContexts) return;
  delete state.planning.dayContexts[dateKey];
}
