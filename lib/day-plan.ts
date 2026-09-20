import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./server-auth.ts";
import { DATE_RE, jerusalemDateTimeToUtc, jerusalemParts } from "./time.ts";
import { loadMembership } from "./household.ts";

export type DayPlanScope = { scope_type: "user" | "household"; scope_id: string };

export type DayPlanItemInput = {
  task_id: string;
  start_at: string;
  end_at?: string | null;
  kind: "fixed" | "flexible";
  source: "manual" | "replan" | "calendar";
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
    .select("id,scope_type,scope_id,plan_date")
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
    .select("id,scope_type,scope_id,plan_date")
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
    .select("id,scope_type,scope_id,plan_date")
    .eq("scope_type", scope.scope_type)
    .eq("scope_id", scope.scope_id)
    .eq("plan_date", date)
    .maybeSingle();
  if (!plan) return { plan: null, items: [] as Record<string, unknown>[] };
  const { data: items, error } = await db
    .from("day_plan_items")
    .select("id,task_id,start_at,end_at,kind,source")
    .eq("day_plan_id", plan.id)
    .order("start_at");
  if (error) throw new HttpError(503, "לא הצלחנו לטעון את הלוז.");
  return { plan, items: items ?? [] };
}

export async function upsertDayPlanItem(
  db: SupabaseClient,
  userId: string,
  date: string,
  item: DayPlanItemInput,
  household = false,
) {
  const current = await loadDayPlan(db, userId, date, household);
  const rest: DayPlanItemInput[] = (current.items ?? []).flatMap((raw) => {
    const row = raw as Record<string, unknown>;
    const taskId = String(row.task_id ?? "");
    if (!taskId || taskId === item.task_id) return [];
    return [
      {
        task_id: taskId,
        start_at: String(row.start_at),
        end_at: row.end_at ? String(row.end_at) : null,
        kind: row.kind === "fixed" ? "fixed" : "flexible",
        source:
          row.source === "calendar"
            ? "calendar"
            : row.source === "replan"
              ? "replan"
              : "manual",
      } satisfies DayPlanItemInput,
    ];
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
  const rest: DayPlanItemInput[] = (current.items ?? []).flatMap((raw) => {
    const row = raw as Record<string, unknown>;
    const id = String(row.task_id ?? "");
    if (!id || id === taskId) return [];
    return [
      {
        task_id: id,
        start_at: String(row.start_at),
        end_at: row.end_at ? String(row.end_at) : null,
        kind: row.kind === "fixed" ? "fixed" : "flexible",
        source:
          row.source === "calendar"
            ? "calendar"
            : row.source === "replan"
              ? "replan"
              : "manual",
      } satisfies DayPlanItemInput,
    ];
  });
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

/**
 * Re-plan only when explicitly invoked. Uses calendar cache as constraints.
 * Does NOT create day_plan_items from calendar events.
 */
export async function replanDay(
  db: SupabaseClient,
  userId: string,
  date: string,
  taskIds: string[],
  constraints: CalendarConstraint[],
  household = false,
) {
  const slots: DayPlanItemInput[] = [];
  let cursor = jerusalemDateTimeToUtc(date, "09:00").getTime();
  for (const taskId of taskIds) {
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
    slots.push({
      task_id: taskId,
      start_at: new Date(start).toISOString(),
      end_at: new Date(end).toISOString(),
      kind: "flexible",
      source: "replan",
    });
    cursor = end + 15 * 60 * 1000;
  }
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
