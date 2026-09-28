import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./server-auth.ts";
import { DATE_RE, TIME_RE } from "./time.ts";
import {
  ensureRoutineOccurrences,
  rewriteRoutineOccurrencesFrom,
} from "./day-plan.ts";
import {
  normalizeWeekdays,
  type RoutineExceptionKind,
  type RoutineSchedule,
} from "./routine-schedule.ts";

const ROUTINE_COLUMNS =
  "id,task_id,weekdays,time_of_day,starts_on,ends_on,active,timezone,created_at,updated_at";

export function jerusalemToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function asSchedule(row: Record<string, unknown>): RoutineSchedule {
  return {
    id: String(row.id),
    task_id: String(row.task_id),
    weekdays: normalizeWeekdays(row.weekdays),
    time_of_day: row.time_of_day ? String(row.time_of_day) : null,
    starts_on: String(row.starts_on),
    ends_on: row.ends_on ? String(row.ends_on) : null,
    active: row.active !== false,
  };
}

export async function loadRoutines(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from("routines")
    .select(ROUTINE_COLUMNS)
    .eq("user_id", userId)
    .order("starts_on");
  if (error) throw new HttpError(503, "לא הצלחנו לטעון משימות קבועות.");
  return data ?? [];
}

/** Occurrence exceptions for a civil Jerusalem date (done/skip/override). */
export async function loadRoutineExceptionsForDate(
  db: SupabaseClient,
  userId: string,
  date: string,
) {
  if (!DATE_RE.test(date)) throw new HttpError(400, "תאריך המופע אינו תקין.");
  const { data, error } = await db
    .from("routine_occurrence_exceptions")
    .select("id,routine_id,occurrence_date,kind,time_of_day")
    .eq("user_id", userId)
    .eq("occurrence_date", date);
  if (error) throw new HttpError(503, "לא הצלחנו לטעון חריגי מופע.");
  return data ?? [];
}

async function ownRoutine(db: SupabaseClient, userId: string, id: string) {
  const { data, error } = await db
    .from("routines")
    .select(ROUTINE_COLUMNS)
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new HttpError(503, "לא הצלחנו לטעון משימה קבועה.");
  if (!data) throw new HttpError(404, "המשימה הקבועה לא נמצאה.");
  return data as Record<string, unknown>;
}

export async function findActiveRoutineByTask(db: SupabaseClient, userId: string, taskId: string) {
  const { data, error } = await db
    .from("routines")
    .select(ROUTINE_COLUMNS)
    .eq("user_id", userId)
    .eq("task_id", taskId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new HttpError(503, "לא הצלחנו לטעון משימה קבועה.");
  return data ? asSchedule(data as Record<string, unknown>) : null;
}

async function taskEstimate(db: SupabaseClient, userId: string, taskId: string) {
  const { data, error } = await db
    .from("tasks")
    .select("id,estimate_minutes")
    .eq("user_id", userId)
    .eq("id", taskId)
    .maybeSingle();
  if (error || !data) throw new HttpError(404, "המשימה לא נמצאה.");
  return (data.estimate_minutes as number | null) ?? null;
}

function assertWeekdays(weekdays: unknown) {
  const days = normalizeWeekdays(weekdays);
  if (!Array.isArray(weekdays) || days.length !== weekdays.length || !days.length) {
    throw new HttpError(400, "ימי החזרה אינם תקינים.");
  }
  return days;
}

function assertTime(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !TIME_RE.test(value.slice(0, 5))) {
    throw new HttpError(400, "השעה אינה תקינה.");
  }
  return value.slice(0, 5);
}

export async function createRoutine(
  db: SupabaseClient,
  userId: string,
  input: {
    taskId: string;
    weekdays: number[];
    timeOfDay: string | null;
    startsOn: string;
    endsOn?: string | null;
  },
) {
  if (!DATE_RE.test(input.startsOn)) throw new HttpError(400, "תאריך ההתחלה אינו תקין.");
  if (input.endsOn && !DATE_RE.test(input.endsOn)) throw new HttpError(400, "תאריך הסיום אינו תקין.");
  const weekdays = assertWeekdays(input.weekdays);
  const timeOfDay = assertTime(input.timeOfDay);
  await taskEstimate(db, userId, input.taskId);
  const existing = await findActiveRoutineByTask(db, userId, input.taskId);
  const now = new Date().toISOString();
  if (existing) {
    const { error } = await db
      .from("routines")
      .update({
        weekdays,
        time_of_day: timeOfDay,
        starts_on: input.startsOn,
        ends_on: input.endsOn ?? null,
        active: true,
        updated_at: now,
      })
      .eq("user_id", userId)
      .eq("id", existing.id);
    if (error) throw new HttpError(503, "לא הצלחנו לעדכן משימה קבועה.");
    return loadRoutines(db, userId);
  }
  const { error } = await db.from("routines").insert({
    user_id: userId,
    task_id: input.taskId,
    weekdays,
    time_of_day: timeOfDay,
    starts_on: input.startsOn,
    ends_on: input.endsOn ?? null,
    timezone: "Asia/Jerusalem",
  });
  if (error) throw new HttpError(503, "לא הצלחנו ליצור משימה קבועה.");
  return loadRoutines(db, userId);
}

export async function updateRoutine(
  db: SupabaseClient,
  userId: string,
  input: {
    id: string;
    weekdays?: number[];
    timeOfDay?: string | null;
    endsOn?: string | null;
    seriesScope?: "once" | "from_today" | "series" | null;
    occurrenceDate?: string | null;
  },
) {
  const row = await ownRoutine(db, userId, input.id);
  const schedule = asSchedule(row);
  const fromDate = input.occurrenceDate && DATE_RE.test(input.occurrenceDate)
    ? input.occurrenceDate
    : jerusalemToday();
  if (input.seriesScope === "once") {
    if (!input.occurrenceDate || !DATE_RE.test(input.occurrenceDate)) {
      throw new HttpError(400, "חסר תאריך למופע.");
    }
    if (input.timeOfDay === undefined) throw new HttpError(400, "חסרה שעה למופע הזה.");
    await applyRoutineException(db, userId, {
      routineId: schedule.id,
      date: input.occurrenceDate,
      kind: "override",
      timeOfDay: input.timeOfDay,
    });
    return loadRoutines(db, userId);
  }
  const weekdays = input.weekdays ? assertWeekdays(input.weekdays) : schedule.weekdays;
  const timeOfDay = input.timeOfDay === undefined ? schedule.time_of_day : assertTime(input.timeOfDay);
  const { error } = await db
    .from("routines")
    .update({
      weekdays,
      time_of_day: timeOfDay,
      ...(input.endsOn !== undefined ? { ends_on: input.endsOn } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", schedule.id);
  if (error) throw new HttpError(503, "לא הצלחנו לעדכן משימה קבועה.");
  const next = { ...schedule, weekdays, time_of_day: timeOfDay };
  const estimate = await taskEstimate(db, userId, schedule.task_id);
  await rewriteRoutineOccurrencesFrom(db, userId, next, fromDate, estimate);
  return loadRoutines(db, userId);
}

export async function stopRoutine(
  db: SupabaseClient,
  userId: string,
  id: string,
  fromDate = jerusalemToday(),
) {
  if (!DATE_RE.test(fromDate)) throw new HttpError(400, "תאריך העצירה אינו תקין.");
  const row = await ownRoutine(db, userId, id);
  const schedule = asSchedule(row);
  const { error } = await db
    .from("routines")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw new HttpError(503, "לא הצלחנו להפסיק את המשימה הקבועה.");
  const estimate = await taskEstimate(db, userId, schedule.task_id);
  await rewriteRoutineOccurrencesFrom(
    db,
    userId,
    { ...schedule, active: false },
    fromDate,
    estimate,
  );
  return loadRoutines(db, userId);
}

export async function applyRoutineException(
  db: SupabaseClient,
  userId: string,
  input: {
    routineId: string;
    date: string;
    kind: RoutineExceptionKind | "clear";
    timeOfDay?: string | null;
  },
) {
  if (!DATE_RE.test(input.date)) throw new HttpError(400, "תאריך המופע אינו תקין.");
  const row = await ownRoutine(db, userId, input.routineId);
  const schedule = asSchedule(row);
  if (input.kind === "clear") {
    const { error } = await db
      .from("routine_occurrence_exceptions")
      .delete()
      .eq("user_id", userId)
      .eq("routine_id", schedule.id)
      .eq("occurrence_date", input.date);
    if (error) throw new HttpError(503, "לא הצלחנו לבטל את החריג.");
  } else {
    const timeOfDay = input.kind === "override" ? assertTime(input.timeOfDay) : null;
    if (input.kind === "override" && !timeOfDay) throw new HttpError(400, "חסרה שעה לחריג.");
    const { error } = await db.from("routine_occurrence_exceptions").upsert(
      {
        user_id: userId,
        routine_id: schedule.id,
        occurrence_date: input.date,
        kind: input.kind,
        time_of_day: timeOfDay,
      },
      { onConflict: "routine_id,occurrence_date" },
    );
    if (error) throw new HttpError(503, "לא הצלחנו לשמור חריג למופע.");
  }
  await ensureRoutineOccurrences(db, userId, input.date, false);
  return loadRoutines(db, userId);
}
