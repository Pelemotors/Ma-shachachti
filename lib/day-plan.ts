import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./server-auth.ts";
import { DATE_RE, jerusalemDateTimeToUtc, jerusalemParts } from "./time.ts";
import { loadMembership } from "./household.ts";
import {
  clockHHMM,
  isRoutineScheduled,
  occurrenceDateFromKey,
  plannedDurationMinutes,
  routineOccurrenceKey,
  syncRoutineItems,
  type RoutineSchedule,
} from "./routine-schedule.ts";

export type DayPlanScope = { scope_type: "user" | "household"; scope_id: string };

export type DayPlanItemInput = {
  task_id: string;
  start_at: string;
  end_at?: string | null;
  kind: "fixed" | "flexible";
  source: "manual" | "replan" | "calendar";
  routine_id?: string | null;
  occurrence_key?: string | null;
};

export type ReplanOptions = {
  windowStart?: string;
  windowEnd?: string;
  planningContext?: string;
  planUpdatedAt?: string | null;
};

export async function resolveUserScope(
  db: SupabaseClient,
  userId: string,
  household = false,
): Promise<DayPlanScope> {
  if (!household) return { scope_type: "user", scope_id: userId };
  const membership = await loadMembership(db, userId);
  if (!membership) throw new HttpError(404, "אין מרחב משותף.");
  return { scope_type: "household", scope_id: membership.household_id };
}

export async function getOrCreateDayPlan(
  db: SupabaseClient,
  userId: string,
  date: string,
  household = false,
) {
  if (!DATE_RE.test(date)) throw new HttpError(400, "תאריך אינו תקין.");
  const scope = await resolveUserScope(db, userId, household);
  const { data: existing } = await db
    .from("day_plans")
    .select("id,scope_type,scope_id,plan_date,updated_at")
    .eq("scope_type", scope.scope_type)
    .eq("scope_id", scope.scope_id)
    .eq("plan_date", date)
    .maybeSingle();
  if (existing) return existing;
  const { data, error } = await db
    .from("day_plans")
    .insert({
      ...scope,
      plan_date: date,
      created_by: userId,
    })
    .select("id,scope_type,scope_id,plan_date,updated_at")
    .single();
  if (error || !data) throw new HttpError(503, "לא הצלחנו ליצור לוז.");
  return data;
}

export async function loadDayPlan(
  db: SupabaseClient,
  userId: string,
  date: string,
  household = false,
) {
  const scope = await resolveUserScope(db, userId, household);
  const { data: plan } = await db
    .from("day_plans")
    .select("id,scope_type,scope_id,plan_date,updated_at")
    .eq("scope_type", scope.scope_type)
    .eq("scope_id", scope.scope_id)
    .eq("plan_date", date)
    .maybeSingle();
  if (!plan) return { plan: null, items: [] as Record<string, unknown>[] };
  const { data: items, error } = await db
    .from("day_plan_items")
    .select("id,task_id,start_at,end_at,kind,source,routine_id,occurrence_key")
    .eq("day_plan_id", plan.id)
    .order("start_at");
  if (error) throw new HttpError(503, "לא הצלחנו לטעון את הלוז.");
  return { plan, items: items ?? [] };
}

export function dayPlanItemFromRow(raw: Record<string, unknown>): DayPlanItemInput | null {
  const taskId = String(raw.task_id ?? "");
  const startAt = String(raw.start_at ?? "");
  if (!taskId || !startAt) return null;
  return {
    task_id: taskId,
    start_at: startAt,
    end_at: raw.end_at ? String(raw.end_at) : null,
    kind: raw.kind === "fixed" ? "fixed" : "flexible",
    source: raw.source === "calendar" ? "calendar" : raw.source === "replan" ? "replan" : "manual",
    routine_id: raw.routine_id ? String(raw.routine_id) : null,
    occurrence_key: raw.occurrence_key ? String(raw.occurrence_key) : null,
  };
}

function planItemsFromRows(rows: unknown[]) {
  return rows.flatMap((raw) => {
    const item = dayPlanItemFromRow(raw as Record<string, unknown>);
    return item ? [item] : [];
  });
}

/**
 * Places timed routine occurrences on the day. Does not schedule a task
 * because its deadline falls on this date, and does not invent a time for
 * a routine that has none. A second load keeps occurrence_key, so it does
 * not create another copy.
 */
export async function ensureRoutineOccurrences(db: SupabaseClient, userId: string, date: string, household = false) {
  const current = await loadDayPlan(db, userId, date, household);
  const { data, error } = await db
    .from("routines")
    .select("id,task_id,weekdays,time_of_day,starts_on,ends_on,active")
    .eq("user_id", userId);
  if (error) throw new HttpError(503, "לא הצלחנו לטעון משימות קבועות.");
  const routines = (data ?? []) as RoutineSchedule[];
  const routineIds = routines.map((routine) => routine.id);
  let exceptions: Array<{ routine_id: string; occurrence_date: string; kind: "skip" | "override" | "done"; time_of_day: string | null }> = [];
  if (routineIds.length) {
    const { data: rows, error: exceptionError } = await db
      .from("routine_occurrence_exceptions")
      .select("routine_id,occurrence_date,kind,time_of_day")
      .eq("user_id", userId)
      .eq("occurrence_date", date)
      .in("routine_id", routineIds);
    if (exceptionError) throw new HttpError(503, "לא הצלחנו לטעון חריגי שגרה.");
    exceptions = (rows ?? []) as typeof exceptions;
  }
  const taskIds = [...new Set(routines.map((routine) => routine.task_id))];
  const estimateByTaskId: Record<string, number | null> = {};
  if (taskIds.length) {
    const { data: tasks, error: taskError } = await db
      .from("tasks")
      .select("id,estimate_minutes")
      .eq("user_id", userId)
      .in("id", taskIds);
    if (taskError) throw new HttpError(503, "לא הצלחנו לטעון משך משימות.");
    for (const task of tasks ?? []) {
      estimateByTaskId[String(task.id)] = task.estimate_minutes ?? null;
    }
  }
  const existing = planItemsFromRows(current.items ?? []);
  const synced = syncRoutineItems({
    date,
    routines,
    exceptions,
    estimateByTaskId,
    existing,
  });
  if (!synced.changed) return current;
  return updateDayPlan(db, userId, date, synced.items, household);
}

export async function rewriteRoutineOccurrencesFrom(
  db: SupabaseClient,
  userId: string,
  routine: RoutineSchedule,
  fromDate: string,
  estimateMinutes: number | null,
) {
  const { data, error } = await db
    .from("day_plan_items")
    .select("occurrence_key")
    .eq("routine_id", routine.id);
  if (error) throw new HttpError(503, "לא הצלחנו לעדכן מופעים עתידיים.");
  const dates = new Set<string>();
  for (const row of data ?? []) {
    const date = occurrenceDateFromKey(routine.id, String(row.occurrence_key ?? ""));
    if (date && date >= fromDate) dates.add(date);
  }
  for (const date of dates) {
    const current = await loadDayPlan(db, userId, date, false);
    const items = planItemsFromRows(current.items ?? []);
    const key = routineOccurrenceKey(routine.id, date);
    const time = clockHHMM(routine.time_of_day);
    const keep = isRoutineScheduled(routine, date) && Boolean(time);
    const next = items.flatMap((item) => {
      if (item.occurrence_key !== key) return [item];
      if (!keep || !time) return [];
      const start = jerusalemDateTimeToUtc(date, time);
      const minutes = plannedDurationMinutes(estimateMinutes);
      return [{
        ...item,
        task_id: routine.task_id,
        start_at: start.toISOString(),
        end_at: new Date(start.getTime() + minutes * 60 * 1000).toISOString(),
        kind: "fixed" as const,
        routine_id: routine.id,
        occurrence_key: key,
      }];
    });
    await updateDayPlan(db, userId, date, next, false);
  }
}

export async function upsertDayPlanItem(
  db: SupabaseClient,
  userId: string,
  date: string,
  item: DayPlanItemInput,
  household = false,
) {
  const current = await loadDayPlan(db, userId, date, household);
  const rest = planItemsFromRows(current.items ?? []).filter((row) => {
    if (item.occurrence_key) return row.occurrence_key !== item.occurrence_key;
    return row.occurrence_key || row.task_id !== item.task_id;
  });
  return updateDayPlan(db, userId, date, [...rest, item], household);
}

export async function removeDayPlanItem(
  db: SupabaseClient,
  userId: string,
  date: string,
  taskId: string,
  household = false,
) {
  const current = await loadDayPlan(db, userId, date, household);
  const rest = planItemsFromRows(current.items ?? []).filter(
    (item) => item.occurrence_key || item.task_id !== taskId,
  );
  return updateDayPlan(db, userId, date, rest, household);
}

/** Point mutation — does not replan the rest of the day. */
export async function updateDayPlan(
  db: SupabaseClient,
  userId: string,
  date: string,
  items: DayPlanItemInput[],
  household = false,
) {
  const plan = await getOrCreateDayPlan(db, userId, date, household);
  const now = new Date().toISOString();
  const { error: clearError } = await db
    .from("day_plan_items")
    .delete()
    .eq("day_plan_id", plan.id);
  if (clearError) throw new HttpError(503, "עדכון הלוז נכשל.");
  if (!items.length) return loadDayPlan(db, userId, date, household);
  const { error } = await db.from("day_plan_items").insert(
    items.map((item) => ({
      day_plan_id: plan.id,
      task_id: item.task_id,
      start_at: item.start_at,
      end_at: item.end_at ?? null,
      kind: item.kind,
      source: item.source,
      updated_at: now,
      routine_id: item.routine_id ?? null,
      occurrence_key: item.occurrence_key ?? null,
    })),
  );
  if (error) throw new HttpError(503, "שמירת פריטי הלוז נכשלה.");
  return loadDayPlan(db, userId, date, household);
}

export type CalendarConstraint = {
  title: string;
  start_at: string;
  end_at: string;
};

export function detectConflicts(
  items: Array<{ start_at: string; end_at?: string | null }>,
  constraints: CalendarConstraint[],
) {
  const conflicts: Array<{ title: string; start: string; end: string }> = [];
  for (const item of items) {
    const start = Date.parse(item.start_at);
    const end = item.end_at ? Date.parse(item.end_at) : start + 30 * 60 * 1000;
    for (const event of constraints) {
      const eStart = Date.parse(event.start_at);
      const eEnd = Date.parse(event.end_at);
      if (start < eEnd && end > eStart) {
        const parts = jerusalemParts(event.start_at);
        const endParts = jerusalemParts(event.end_at);
        conflicts.push({
          title: `${parts.time}–${endParts.time} ${event.title}`,
          start: event.start_at,
          end: event.end_at,
        });
      }
    }
  }
  return conflicts;
}

export function taskIdsForPlanDate(
  tasks: Array<{ id: string; status?: string; due_on?: string | null }>,
  date: string,
  alreadyOnPlan: string[] = [],
) {
  const dueThatDay = tasks
    .filter((task) => (task.status ?? "open") === "open" && task.due_on === date)
    .map((task) => task.id);
  return [...new Set([...alreadyOnPlan, ...dueThatDay])];
}

export function mergeDayPlanItems(
  existing: DayPlanItemInput[],
  incomingIds: string[],
  date: string,
  constraints: CalendarConstraint[],
  windowStart?: string,
  windowEnd?: string,
) {
  const kept = existing.filter((item) => item.task_id);
  const keptIds = new Set(kept.map((item) => item.task_id));
  const toAdd = incomingIds.filter((id) => id && !keptIds.has(id));
  let cursor = kept.reduce((max, item) => {
    const end = item.end_at ? Date.parse(item.end_at) : Date.parse(item.start_at);
    return Number.isNaN(end) ? max : Math.max(max, end + 15 * 60 * 1000);
  }, jerusalemDateTimeToUtc(date, windowStart ?? "09:00").getTime());
  const endLimit = windowEnd ? jerusalemDateTimeToUtc(date, windowEnd).getTime() : null;
  const added: DayPlanItemInput[] = [];
  for (const taskId of toAdd) {
    let start = cursor;
    let end = start + 45 * 60 * 1000;
    for (const event of constraints) {
      const eStart = Date.parse(event.start_at);
      const eEnd = Date.parse(event.end_at);
      if (start < eEnd && end > eStart) {
        start = eEnd;
        end = start + 45 * 60 * 1000;
      }
    }
    if (endLimit !== null && end > endLimit) break;
    added.push({
      task_id: taskId,
      start_at: new Date(start).toISOString(),
      end_at: new Date(end).toISOString(),
      kind: "flexible",
      source: "replan",
    });
    cursor = end + 15 * 60 * 1000;
  }
  return [...kept, ...added];
}

/**
 * Re-plan only when explicitly invoked. Preserves existing items (fixed and flexible).
 * Only appends newly requested, date-relevant task ids. Never dumps the full open list.
 */
export async function replanDay(
  db: SupabaseClient,
  userId: string,
  date: string,
  taskIds: string[],
  constraints: CalendarConstraint[],
  household = false,
  options: ReplanOptions = {},
) {
  const current = await loadDayPlan(db, userId, date, household);
  if (
    options.planUpdatedAt &&
    current.plan &&
    String((current.plan as Record<string, unknown>).updated_at ?? "") !== options.planUpdatedAt
  ) {
    throw new HttpError(409, "הלוז השתנה מאז הטעינה. רענני את המסך ונסי שוב.");
  }
  const existing = planItemsFromRows(current.items ?? []);
  const requested = Array.from(new Set(taskIds.filter(Boolean)));
  let allowed = requested;
  if (requested.length) {
    const { data: rows } = await db
      .from("tasks")
      .select("id,status,due_on")
      .eq("user_id", userId)
      .in("id", requested);
    allowed = taskIdsForPlanDate(
      (rows ?? []) as Array<{ id: string; status?: string; due_on?: string | null }>,
      date,
      existing.map((item) => item.task_id),
    );
  } else {
    allowed = existing.map((item) => item.task_id);
  }
  const slots = mergeDayPlanItems(existing, allowed, date, constraints, options.windowStart, options.windowEnd);
  const saved = await updateDayPlan(db, userId, date, slots, household);
  return { ...saved, conflicts: detectConflicts(slots, constraints) };
}

export function itemFromExplicitCalendarAction(input: {
  task_id: string;
  start_at: string;
  end_at?: string | null;
}): DayPlanItemInput {
  return {
    task_id: input.task_id,
    start_at: input.start_at,
    end_at: input.end_at ?? null,
    kind: "fixed",
    source: "calendar",
  };
}
