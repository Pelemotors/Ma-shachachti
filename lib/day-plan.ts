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

export type ResolvedPlanningWindow = {
  windowStart: string;
  windowEnd: string;
  fillGaps: boolean;
  gapMinutes: number;
  contextApplied: boolean;
};

/**
 * Turns free-text „מה חשוב / שונה היום” into concrete replan window knobs.
 * Must change scheduling outcomes — not just echo the string.
 */
export function resolvePlanningContext(
  windowStart?: string,
  windowEnd?: string,
  planningContext?: string | null,
): ResolvedPlanningWindow {
  let start = windowStart && /^\d{2}:\d{2}$/.test(windowStart) ? windowStart : "07:00";
  let end = windowEnd && /^\d{2}:\d{2}$/.test(windowEnd) ? windowEnd : "19:00";
  const text = (planningContext ?? "").trim();
  let fillGaps = false;
  let gapMinutes = 15;
  if (!text) {
    return { windowStart: start, windowEnd: end, fillGaps, gapMinutes, contextApplied: false };
  }

  // „אני רוצה לסיים מוקדם” → clamp day end earlier.
  if (/לסיים מוקדם|סיים מוקדם|לגמור מוקדם|לסיים יותר מוקדם/.test(text) || (/מוקדם/.test(text) && /סיים|לסיים|גמור/.test(text))) {
    if (end > "15:00") end = "15:00";
  }

  // „יש לי אורחים בערב” → leave the evening free.
  if (/אורחים/.test(text) || (/בערב/.test(text) && /אורח|ביקור|משפחה|חברים/.test(text)) || /אורחים בערב/.test(text)) {
    if (end > "17:00") end = "17:00";
  }
  if (/בערב/.test(text) && !/בוקר|צהריים/.test(text) && end > "17:00") {
    end = "17:00";
  }

  // „החוג בוטל… שעה פנויה” → pack into gaps instead of only appending after the last slot.
  if (/בוטל|שעה פנויה|זמן פנוי|פנויה|יש לי שעה/.test(text)) {
    fillGaps = true;
    gapMinutes = 5;
  }

  if (start >= end) {
    start = "07:00";
    end = end > start ? end : "19:00";
  }

  return { windowStart: start, windowEnd: end, fillGaps, gapMinutes, contextApplied: true };
}

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
  const selectCols = "id,scope_type,scope_id,plan_date,updated_at";
  const { data: existing } = await db
    .from("day_plans")
    .select(selectCols)
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
    .select(selectCols)
    .single();
  // Unique (scope_type, scope_id, plan_date) — concurrent create: re-read winner.
  if (error) {
    const { data: raced } = await db
      .from("day_plans")
      .select(selectCols)
      .eq("scope_type", scope.scope_type)
      .eq("scope_id", scope.scope_id)
      .eq("plan_date", date)
      .maybeSingle();
    if (raced) return raced;
    throw new HttpError(503, "לא הצלחנו ליצור לוז.");
  }
  if (!data) throw new HttpError(503, "לא הצלחנו ליצור לוז.");
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

/**
 * Flexible task-linked day_plan slots (no occurrence_key) mirror onto tasks.planned_*.
 * Fixed day_plan slots may use due_* for deadline; routine occurrences never overwrite planned_*.
 * day_plan_items remain the schedule SoT; planned_* is a denormalized mirror for Tasks UI.
 */
async function syncTaskPlannedMirror(
  db: SupabaseClient,
  userId: string,
  date: string,
  previous: DayPlanItemInput[],
  next: DayPlanItemInput[],
) {
  const now = new Date().toISOString();
  const prevFlexibleIds = new Set(
    previous
      .filter((item) => !item.occurrence_key && item.kind === "flexible")
      .map((item) => item.task_id),
  );
  const nextFlexible = new Map<string, DayPlanItemInput>();
  for (const item of next) {
    if (item.occurrence_key || item.kind !== "flexible") continue;
    nextFlexible.set(item.task_id, item);
  }
  for (const [taskId, item] of nextFlexible) {
    await db
      .from("tasks")
      .update({
        planned_start_at: item.start_at,
        planned_end_at: item.end_at ?? null,
        updated_at: now,
      })
      .eq("user_id", userId)
      .eq("id", taskId);
  }
  for (const taskId of prevFlexibleIds) {
    if (nextFlexible.has(taskId)) continue;
    const { data: task } = await db
      .from("tasks")
      .select("id,planned_start_at")
      .eq("user_id", userId)
      .eq("id", taskId)
      .maybeSingle();
    if (!task?.planned_start_at) continue;
    if (jerusalemParts(String(task.planned_start_at)).date !== date) continue;
    await db
      .from("tasks")
      .update({
        planned_start_at: null,
        planned_end_at: null,
        updated_at: now,
      })
      .eq("user_id", userId)
      .eq("id", taskId);
  }
}

/**
 * Point mutation of the canonical day_plan for one date.
 * Replaces the item list for that plan only — does not invent a new day algorithm.
 * Prefer upsertDayPlanItem / removeDayPlanItem for single-slot edits.
 * Explicit full rebuilds belong in replanDay.
 */
export async function updateDayPlan(
  db: SupabaseClient,
  userId: string,
  date: string,
  items: DayPlanItemInput[],
  household = false,
) {
  const plan = await getOrCreateDayPlan(db, userId, date, household);
  const previous = planItemsFromRows(
    (
      await db
        .from("day_plan_items")
        .select("id,task_id,start_at,end_at,kind,source,routine_id,occurrence_key")
        .eq("day_plan_id", plan.id)
    ).data ?? [],
  );
  const now = new Date().toISOString();
  const { error: clearError } = await db
    .from("day_plan_items")
    .delete()
    .eq("day_plan_id", plan.id);
  if (clearError) throw new HttpError(503, "עדכון הלוז נכשל.");
  if (items.length) {
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
  }
  const { error: touchError } = await db
    .from("day_plans")
    .update({ updated_at: now })
    .eq("id", plan.id);
  if (touchError) throw new HttpError(503, "עדכון הלוז נכשל.");
  await syncTaskPlannedMirror(db, userId, date, previous, items);
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
  mergeOptions?: { fillGaps?: boolean; gapMinutes?: number },
) {
  const kept = existing.filter(
    (item) => item.task_id && (item.kind === "fixed" || item.occurrence_key),
  );
  const lockedIds = new Set(kept.map((item) => item.task_id));
  const flexibleExistingIds = existing
    .filter((item) => item.task_id && !lockedIds.has(item.task_id))
    .map((item) => item.task_id);
  const toAdd = Array.from(new Set([...flexibleExistingIds, ...incomingIds]))
    .filter((id) => id && !lockedIds.has(id));
  const gapMs = Math.max(0, (mergeOptions?.gapMinutes ?? 15) * 60 * 1000);
  const slotMs = 45 * 60 * 1000;
  const windowStartMs = jerusalemDateTimeToUtc(date, windowStart ?? "07:00").getTime();
  const endLimit = windowEnd ? jerusalemDateTimeToUtc(date, windowEnd).getTime() : null;
  const fillGaps = Boolean(mergeOptions?.fillGaps);

  const blocked = [
    ...kept.map((item) => ({
      start: Date.parse(item.start_at),
      end: item.end_at ? Date.parse(item.end_at) : Date.parse(item.start_at) + slotMs,
    })),
    ...constraints.map((event) => ({
      start: Date.parse(event.start_at),
      end: Date.parse(event.end_at),
    })),
  ]
    .filter((block) => Number.isFinite(block.start) && Number.isFinite(block.end))
    .sort((a, b) => a.start - b.start);

  function placeAfterLast(): number {
    return kept.reduce((max, item) => {
      const end = item.end_at ? Date.parse(item.end_at) : Date.parse(item.start_at);
      return Number.isNaN(end) ? max : Math.max(max, end + gapMs);
    }, windowStartMs);
  }

  function nextGapStart(fromMs: number): number | null {
    let cursor = Math.max(fromMs, windowStartMs);
    for (const block of blocked) {
      if (block.end <= cursor) continue;
      if (block.start - cursor >= slotMs) return cursor;
      cursor = Math.max(cursor, block.end + gapMs);
    }
    if (endLimit !== null && cursor + slotMs > endLimit) return null;
    return cursor;
  }

  let cursor = fillGaps ? windowStartMs : placeAfterLast();
  const added: DayPlanItemInput[] = [];
  for (const taskId of toAdd) {
    let start = fillGaps ? nextGapStart(cursor) : cursor;
    if (start === null) break;
    let end = start + slotMs;
    for (const event of constraints) {
      const eStart = Date.parse(event.start_at);
      const eEnd = Date.parse(event.end_at);
      if (start < eEnd && end > eStart) {
        start = eEnd + gapMs;
        end = start + slotMs;
      }
    }
    for (const block of blocked) {
      if (start < block.end && end > block.start) {
        start = block.end + gapMs;
        end = start + slotMs;
      }
    }
    if (endLimit !== null && end > endLimit) break;
    if (start < windowStartMs) {
      start = windowStartMs;
      end = start + slotMs;
      if (endLimit !== null && end > endLimit) break;
    }
    added.push({
      task_id: taskId,
      start_at: new Date(start).toISOString(),
      end_at: new Date(end).toISOString(),
      kind: "flexible",
      source: "replan",
    });
    blocked.push({ start, end });
    blocked.sort((a, b) => a.start - b.start);
    cursor = end + gapMs;
  }
  return [...kept, ...added];
}

/**
 * Explicit rebuild intent only (e.g. „צור לי לו״ז”).
 * Preserves existing fixed/routine items; reschedules existing flexible items and
 * appends newly allowed task ids.
 * Applies planning_context to the working window before merge.
 * Never called from Home/Schedule open — only from an explicit replan action.
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
  const resolved = resolvePlanningContext(
    options.windowStart,
    options.windowEnd,
    options.planningContext,
  );
  const slots = mergeDayPlanItems(
    existing,
    allowed,
    date,
    constraints,
    resolved.windowStart,
    resolved.windowEnd,
    { fillGaps: resolved.fillGaps, gapMinutes: resolved.gapMinutes },
  );
  const saved = await updateDayPlan(db, userId, date, slots, household);
  return {
    ...saved,
    conflicts: detectConflicts(slots, constraints),
    planning: {
      window_start: resolved.windowStart,
      window_end: resolved.windowEnd,
      fill_gaps: resolved.fillGaps,
      context_applied: resolved.contextApplied,
    },
  };
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
