import type { DayPlanItemInput } from "./day-plan.ts";
import { jerusalemDateTimeToUtc } from "./time.ts";

/** Planner slot used only when a task has no estimate_minutes. */
export const PLANNER_SLOT_MINUTES = 45;

export type RoutineSchedule = {
  id: string;
  task_id: string;
  weekdays: number[];
  time_of_day: string | null;
  starts_on: string;
  ends_on: string | null;
  active: boolean;
};

export type RoutineExceptionKind = "skip" | "override" | "done";

export type RoutineException = {
  routine_id: string;
  occurrence_date: string;
  kind: RoutineExceptionKind;
  time_of_day: string | null;
};

export function plannedDurationMinutes(estimate: number | null | undefined) {
  if (
    typeof estimate === "number" &&
    Number.isInteger(estimate) &&
    estimate >= 1 &&
    estimate <= 1440
  ) {
    return estimate;
  }
  return PLANNER_SLOT_MINUTES;
}

/** Deterministic identity for one routine on one civil date. */
export function routineOccurrenceKey(routineId: string, date: string) {
  return `${routineId}:${date}`;
}

export function occurrenceDateFromKey(routineId: string, key: string | null | undefined) {
  const prefix = `${routineId}:`;
  if (!key?.startsWith(prefix)) return null;
  const date = key.slice(prefix.length);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

/** Weekday of a civil YYYY-MM-DD. 0 = Sunday … 6 = Saturday. */
export function civilWeekday(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function clockHHMM(value: string | null | undefined) {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})/.exec(value);
  return match ? `${match[1]}:${match[2]}` : null;
}

export function normalizeWeekdays(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((day) => day >= 0 && day <= 6))].sort(
    (a, b) => a - b,
  );
}

export function isRoutineScheduled(routine: RoutineSchedule, date: string) {
  if (!routine.active) return false;
  if (routine.starts_on > date) return false;
  if (routine.ends_on && routine.ends_on < date) return false;
  return normalizeWeekdays(routine.weekdays).includes(civilWeekday(date));
}

function samePlanItem(left: DayPlanItemInput, right: DayPlanItemInput) {
  return (
    left.task_id === right.task_id &&
    left.start_at === right.start_at &&
    (left.end_at ?? null) === (right.end_at ?? null) &&
    left.kind === right.kind &&
    left.source === right.source &&
    (left.routine_id ?? null) === (right.routine_id ?? null) &&
    (left.occurrence_key ?? null) === (right.occurrence_key ?? null)
  );
}

/**
 * Materializes timed routine occurrences for one date.
 * A deadline is not an input. A routine without a time is not given a time.
 * Existing occurrence identity is kept, so a second pass does not duplicate it.
 * Skip removes that date. Override updates that date's time. Done keeps the slot.
 */
export function syncRoutineItems(input: {
  date: string;
  routines: RoutineSchedule[];
  exceptions: RoutineException[];
  estimateByTaskId: Readonly<Record<string, number | null | undefined>>;
  existing: DayPlanItemInput[];
}) {
  const items = input.existing.map((item) => ({ ...item }));
  const indexByKey = new Map<string, number>();
  items.forEach((item, index) => {
    if (item.occurrence_key) indexByKey.set(item.occurrence_key, index);
  });
  const drop = new Set<number>();

  for (const routine of input.routines) {
    const key = routineOccurrenceKey(routine.id, input.date);
    const index = indexByKey.get(key);
    const exception = input.exceptions.find(
      (row) => row.routine_id === routine.id && row.occurrence_date === input.date,
    );
    if (exception?.kind === "skip") {
      if (index !== undefined) drop.add(index);
      continue;
    }
    const override = exception?.kind === "override" ? clockHHMM(exception.time_of_day) : null;
    const time = override ?? clockHHMM(routine.time_of_day);
    const shouldPlace = isRoutineScheduled(routine, input.date) && Boolean(time);
    if (!shouldPlace || !time) continue;

    if (index === undefined) {
      const start = jerusalemDateTimeToUtc(input.date, time);
      const minutes = plannedDurationMinutes(input.estimateByTaskId[routine.task_id]);
      items.push({
        task_id: routine.task_id,
        start_at: start.toISOString(),
        end_at: new Date(start.getTime() + minutes * 60 * 1000).toISOString(),
        kind: "fixed",
        source: "manual",
        routine_id: routine.id,
        occurrence_key: key,
      });
      continue;
    }

    const current = items[index];
    if (exception?.kind === "override") {
      const start = jerusalemDateTimeToUtc(input.date, time);
      const minutes = plannedDurationMinutes(input.estimateByTaskId[routine.task_id]);
      items[index] = {
        ...current,
        task_id: routine.task_id,
        start_at: start.toISOString(),
        end_at: new Date(start.getTime() + minutes * 60 * 1000).toISOString(),
        kind: "fixed",
        routine_id: routine.id,
        occurrence_key: key,
      };
      continue;
    }

    if (current.routine_id !== routine.id || current.task_id !== routine.task_id) {
      items[index] = {
        ...current,
        task_id: routine.task_id,
        routine_id: routine.id,
        occurrence_key: key,
      };
    }
  }

  const next = items.filter((_, index) => !drop.has(index));
  const changed =
    next.length !== input.existing.length ||
    next.some((item, index) => !samePlanItem(item, input.existing[index]));
  return { items: next, changed };
}
