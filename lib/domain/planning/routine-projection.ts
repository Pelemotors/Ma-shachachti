import type { AppState, Routine } from "@/lib/model";
import { dayKey } from "@/lib/time";

function weekdayIndex(dateKey: string) {
  return new Date(`${dateKey}T12:00:00.000Z`).getUTCDay();
}

function occursOnDate(routine: Routine, dateKey: string): boolean {
  if (routine.status !== "active") return false;
  const schedule = routine.schedule;
  if (!schedule) return false;
  if (schedule.frequency === "daily") return true;
  if (schedule.frequency === "weekly") {
    const days = schedule.weekdays ?? [];
    return days.includes(weekdayIndex(dateKey));
  }
  if (schedule.frequency === "monthly") {
    const day = Number(dateKey.slice(8, 10));
    return schedule.dayOfMonth === day;
  }
  if (schedule.frequency === "interval_days") {
    const every = schedule.everyDays ?? 0;
    if (!every || !routine.createdAt) return false;
    const start = dayKey(new Date(routine.createdAt), "UTC");
    const startMs = Date.parse(`${start}T00:00:00.000Z`);
    const dateMs = Date.parse(`${dateKey}T00:00:00.000Z`);
    const diff = Math.round((dateMs - startMs) / 86400000);
    return diff >= 0 && diff % every === 0;
  }
  return false;
}

/** Deterministic calendar projection for one date. Does not rank importance. */
export function routinesOccurringOn(state: AppState, dateKey: string) {
  return state.routines
    .filter((routine) => occursOnDate(routine, dateKey))
    .map((routine) => ({
      id: routine.id,
      title: routine.title,
      timeOfDay: routine.timeOfDay,
      atTime: routine.atTime,
      status: routine.status,
    }));
}
