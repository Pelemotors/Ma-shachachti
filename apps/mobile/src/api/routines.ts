import { apiRequest } from "./client";

export type MobileRoutine = {
  id: string;
  task_id: string;
  weekdays: number[];
  time_of_day: string | null;
  starts_on: string;
  ends_on: string | null;
  active: boolean;
};

export type MobileRoutineException = {
  id: string;
  routine_id: string;
  occurrence_date: string;
  kind: "skip" | "override" | "done";
  time_of_day: string | null;
};

export function routineOccurrenceKey(routineId: string, date: string) {
  return `${routineId}:${date}`;
}

async function post(body: Record<string, unknown>) {
  return apiRequest<{ routines: MobileRoutine[]; exceptions?: MobileRoutineException[] }>(
    "/api/routines",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export async function listRoutines(date?: string) {
  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  return apiRequest<{
    routines: MobileRoutine[];
    exceptions: MobileRoutineException[];
    date: string;
  }>(`/api/routines${query}`);
}

export async function createRoutine(input: {
  taskId: string;
  weekdays: number[];
  timeOfDay: string | null;
  startsOn: string;
}) {
  return post({
    action: "create",
    task_id: input.taskId,
    weekdays: input.weekdays,
    time_of_day: input.timeOfDay,
    starts_on: input.startsOn,
  });
}

export async function updateRoutine(input: {
  id: string;
  weekdays?: number[];
  timeOfDay?: string | null;
  seriesScope: "once" | "from_today" | "series";
  occurrenceDate?: string;
}) {
  return post({
    action: "update",
    id: input.id,
    ...(input.weekdays ? { weekdays: input.weekdays } : {}),
    ...(input.timeOfDay !== undefined ? { time_of_day: input.timeOfDay } : {}),
    series_scope: input.seriesScope,
    ...(input.occurrenceDate ? { occurrence_date: input.occurrenceDate } : {}),
  });
}

export async function stopRoutine(id: string, occurrenceDate?: string) {
  return post({
    action: "stop",
    id,
    ...(occurrenceDate ? { occurrence_date: occurrenceDate } : {}),
  });
}

export async function routineException(input: {
  id: string;
  date: string;
  kind: "skip" | "override" | "done" | "clear";
  timeOfDay?: string | null;
}) {
  return post({
    action: "exception",
    id: input.id,
    occurrence_date: input.date,
    kind: input.kind,
    ...(input.timeOfDay !== undefined ? { time_of_day: input.timeOfDay } : {}),
  });
}
