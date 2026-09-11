import type { TaskRow } from "./types.ts";
import { jerusalemParts, todayContext } from "./time.ts";

export const HOME_CHRONOLOGICAL_LIMIT = 3;

export type HomeDisplayItem = {
  id: string;
  title: string;
  time: string;
  instant: string;
};

export type HomeDisplaySummary = {
  date: string;
  completed: number;
  total: number;
  chronological: HomeDisplayItem[];
};

function selectedDate(task: TaskRow) {
  if (task.planned_start_at) return jerusalemParts(task.planned_start_at).date;
  if (task.due_at) return jerusalemParts(task.due_at).date;
  return task.due_on;
}

function timedInstant(task: TaskRow) {
  return task.planned_start_at ?? task.due_at;
}

export function buildHomeDisplay(
  tasks: TaskRow[],
  now = new Date(),
  limit = HOME_CHRONOLOGICAL_LIMIT,
): HomeDisplaySummary {
  const date = todayContext(now).date;
  const selected = tasks.filter(
    (task) => task.status !== "cancelled" && selectedDate(task) === date,
  );
  const chronological = selected
    .flatMap((task) => {
      const instant = timedInstant(task);
      if (!instant || task.status !== "open") return [];
      const stamp = new Date(instant);
      if (Number.isNaN(stamp.valueOf()) || stamp < now) return [];
      return [{
        id: task.id,
        title: task.title,
        time: jerusalemParts(stamp).time,
        instant: stamp.toISOString(),
      }];
    })
    .sort((a, b) => a.instant.localeCompare(b.instant) || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, limit));

  return {
    date,
    completed: selected.filter((task) => task.status === "done").length,
    total: selected.length,
    chronological,
  };
}
