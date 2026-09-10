import { addJerusalemDays, jerusalemDateTimeToUtc, jerusalemParts } from "./time.ts";
import type { TaskRow } from "./types.ts";

export type ScheduleTimedItem = {
  task: TaskRow;
  start: string;
  end: string | null;
  fixed: boolean;
};

export function classifyScheduleDay(tasks: TaskRow[], date: string) {
  const timed: ScheduleTimedItem[] = [];
  const throughout: TaskRow[] = [];
  for (const task of tasks) {
    if (task.status === "cancelled") continue;
    const dueDate = task.due_at ? jerusalemParts(task.due_at).date : null;
    const plannedDate = task.planned_start_at
      ? jerusalemParts(task.planned_start_at).date
      : null;
    const plannedStart = task.planned_start_at
      ? jerusalemParts(task.planned_start_at).time
      : null;
    const plannedEnd = task.planned_end_at
      ? jerusalemParts(task.planned_end_at).time
      : null;

    if (dueDate === date && task.due_at) {
      timed.push({
        task,
        start: jerusalemParts(task.due_at).time,
        end: null,
        fixed: true,
      });
      continue;
    }
    if (plannedDate === date && plannedStart) {
      timed.push({
        task,
        start: plannedStart,
        end: plannedEnd && plannedEnd > plannedStart ? plannedEnd : null,
        fixed: false,
      });
      continue;
    }
    if (task.due_on === date && !task.due_at && plannedDate !== date) {
      throughout.push(task);
    }
  }
  timed.sort((a, b) => a.start.localeCompare(b.start));
  return { timed, throughout };
}

export function taskTouchesDate(task: TaskRow, date: string) {
  if (task.status === "cancelled") return false;
  if (task.due_on === date) return true;
  if (task.due_at && jerusalemParts(task.due_at).date === date) return true;
  if (task.planned_start_at && jerusalemParts(task.planned_start_at).date === date) {
    return true;
  }
  return false;
}

export function jerusalemDayRange(date: string) {
  const start = jerusalemDateTimeToUtc(date, "00:00");
  const end = jerusalemDateTimeToUtc(addJerusalemDays(date, 1), "00:00");
  return { start: start.toISOString(), end: end.toISOString() };
}
