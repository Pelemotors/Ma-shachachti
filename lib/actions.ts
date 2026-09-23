import type { SupabaseClient } from "@supabase/supabase-js";
import { inspectActions } from "./action-schema.ts";
import { exactTaskFields, isExactOpenDuplicate } from "./task-identity.ts";
import { DATE_RE, TIME_RE, dueTimeFromDueAt, jerusalemDateTimeToUtc, resolveTaskDeadline } from "./time.ts";
import type {
  ActionResult,
  ActionType,
  AgentAction,
  MemoryRow,
  TaskRow,
} from "./types.ts";
import { mutateChecklist, mutateShopping } from "./lists.ts";
import { removeDayPlanItem, upsertDayPlanItem } from "./day-plan.ts";
import { mutateSubtask } from "./task-subtasks.ts";
import {
  preferenceTopicKey,
  reconcileMemoryWrite,
} from "./memory-display.ts";
import { encodeActionFollowupRelation, parseActionFollowupRelation } from "./agent/learned-relations.ts";

type Db = SupabaseClient;

function fail(type: ActionType, error: string): ActionResult {
  return { ok: false, type, error };
}

function ok(
  type: ActionType,
  extra: {
    id?: string;
    title?: string | null;
    due_on?: string | null;
    due_time?: string | null;
    alreadyExists?: boolean;
    silent?: boolean;
    purchased?: boolean;
  } = {},
): ActionResult {
  return { ok: true, type, ...extra };
}

async function ownTask(db: Db, userId: string, id: string) {
  const { data, error } = await db
    .from("tasks")
    .select(
      "id,due_on,due_at,reminder_at,reminder_enabled,reminder_offset_minutes,reminder_sent_at,reminder_claimed_at,planned_start_at,planned_end_at,reschedule_count,last_rescheduled_at",
    )
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as Pick<
    TaskRow,
    | "id"
    | "due_on"
    | "due_at"
    | "reminder_at"
    | "reminder_enabled"
    | "reminder_offset_minutes"
    | "reminder_sent_at"
    | "reminder_claimed_at"
    | "planned_start_at"
    | "planned_end_at"
    | "reschedule_count"
    | "last_rescheduled_at"
  >;
}

function reminderResetIfNeeded(
  previous: {
    reminder_at: string | null;
    due_at: string | null;
    planned_start_at: string | null;
    reminder_enabled: boolean;
    reminder_offset_minutes: number | null;
  },
  next: {
    reminder_at: string | null;
    due_at: string | null;
    planned_start_at: string | null;
    reminder_enabled: boolean;
    reminder_offset_minutes: number | null;
  },
) {
  const baseChanged =
    previous.reminder_at !== next.reminder_at ||
    previous.due_at !== next.due_at ||
    previous.planned_start_at !== next.planned_start_at;
  const offsetChanged =
    previous.reminder_offset_minutes !== next.reminder_offset_minutes;
  const enabledChanged = previous.reminder_enabled !== next.reminder_enabled;
  if (baseChanged || offsetChanged || enabledChanged) {
    return {
      reminder_sent_at: null,
      reminder_claimed_at: null,
    };
  }
  return {};
}

function resolvePlannedWindow(
  date: string | null | undefined,
  startTime: string | null | undefined,
  endTime: string | null | undefined,
):
  | { ok: true; start: string; end: string | null }
  | { ok: false; error: string } {
  const day = date?.trim() || null;
  const start = startTime?.trim() || null;
  const end = endTime?.trim() || null;
  if (!day || !DATE_RE.test(day) || !start || !TIME_RE.test(start)) {
    return { ok: false, error: "חסרה שעת שיבוץ תקינה." };
  }
  if (end && !TIME_RE.test(end)) {
    return { ok: false, error: "שעת הסיום אינה תקינה." };
  }
  if (end && end <= start) {
    return { ok: false, error: "שעת הסיום צריכה להיות אחרי שעת ההתחלה." };
  }
  return {
    ok: true,
    start: jerusalemDateTimeToUtc(day, start).toISOString(),
    end: end ? jerusalemDateTimeToUtc(day, end).toISOString() : null,
  };
}

async function ownMemory(db: Db, userId: string, id: string) {
  const { data, error } = await db
    .from("agent_memory")
    .select("id")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return false;
  return true;
}

export async function executeAction(
  db: Db,
  userId: string,
  action: AgentAction,
): Promise<ActionResult> {
  const now = new Date().toISOString();

  switch (action.type) {
    case "task.create": {
      if (!action.title) return fail(action.type, "חסר שם למשימה.");
      const deadline = resolveTaskDeadline(action.due_on, action.due_time);
      if (!deadline.ok) return fail(action.type, deadline.error);
      const reminderEnabled =
        action.reminder_patch === "set" && action.reminder_enabled === true;
      const reminderAt =
        action.reminder_at_patch === "set" && action.reminder_at
          ? action.reminder_at
          : null;
      const reminderOffset =
        action.reminder_patch === "set" || action.reminder_offset_minutes != null
          ? action.reminder_offset_minutes
          : null;
      const fields = exactTaskFields({
        title: action.title,
        notes: action.notes,
        due_on: deadline.due_on,
        due_at: deadline.due_at,
      });
      const { data: openRows, error: lookupError } = await db
        .from("tasks")
        .select("id,title,notes,due_on,due_at,status")
        .eq("user_id", userId)
        .eq("status", "open")
        .limit(80);
      if (lookupError)
        return fail(action.type, "לא הצלחנו לבדוק אם המשימה כבר קיימת.");
      const existing = (openRows ?? []).find((row) =>
        isExactOpenDuplicate(row, fields),
      );
      if (existing) {
        return ok(action.type, {
          id: existing.id as string,
          title: fields.title,
          due_on: fields.due_on,
          due_time: dueTimeFromDueAt(fields.due_at),
          alreadyExists: true,
        });
      }
      let plannedWindow: { start: string; end: string | null } | null = null;
      if (action.plan_patch === "set") {
        const planned = resolvePlannedWindow(
          action.planned_date,
          action.planned_start_time,
          action.planned_end_time,
        );
        if (!planned.ok) return fail(action.type, planned.error);
        plannedWindow = { start: planned.start, end: planned.end };
      }
      const { data, error } = await db
        .from("tasks")
        .insert({
          user_id: userId,
          title: fields.title,
          notes: fields.notes,
          due_on: fields.due_on,
          due_at: fields.due_at,
          reminder_at: reminderAt,
          reminder_enabled: reminderEnabled,
          reminder_opted_in_at: reminderEnabled ? now : null,
          reminder_offset_minutes: reminderOffset,
          status: "open",
          updated_at: now,
        })
        .select("id")
        .single();
      if (error || !data)
        return fail(action.type, "לא הצלחנו ליצור את המשימה.");
      if (plannedWindow && action.planned_date) {
        await upsertDayPlanItem(db, userId, action.planned_date, {
          task_id: data.id as string,
          start_at: plannedWindow.start,
          end_at: plannedWindow.end,
          kind: "flexible",
          source: "manual",
        });
      }
      return ok(action.type, {
        id: data.id as string,
        title: fields.title,
        due_on: fields.due_on,
        due_time: deadline.due_time,
      });
    }
    case "task.update": {
      if (!action.id) return fail(action.type, "חסר מזהה משימה.");
      const current = await ownTask(db, userId, action.id);
      if (!current) return fail(action.type, "המשימה לא נמצאה.");
      const patch: Record<string, unknown> = { updated_at: now };
      if (action.title) patch.title = action.title;
      if (action.notes != null) patch.notes = action.notes;
      let nextDueAt = current.due_at;
      let nextDueOn = current.due_on;
      let nextReminderAt = current.reminder_at;
      let nextPlannedStart = current.planned_start_at;
      if (action.due_patch === "clear") {
        nextDueOn = null;
        nextDueAt = null;
        patch.due_on = null;
        patch.due_at = null;
      } else if (action.due_patch === "set") {
        const deadline = resolveTaskDeadline(action.due_on, action.due_time);
        if (!deadline.ok) return fail(action.type, deadline.error);
        nextDueOn = deadline.due_on;
        nextDueAt = deadline.due_at;
        patch.due_on = deadline.due_on;
        patch.due_at = deadline.due_at;
      }
      let nextEnabled = current.reminder_enabled;
      let nextOffset = current.reminder_offset_minutes;
      if (action.reminder_patch === "set") {
        nextEnabled = action.reminder_enabled === true;
        nextOffset = action.reminder_offset_minutes;
        patch.reminder_enabled = nextEnabled;
        patch.reminder_opted_in_at = nextEnabled ? now : null;
        patch.reminder_offset_minutes = nextOffset;
      }
      if (action.reminder_at_patch === "clear") {
        nextReminderAt = null;
        patch.reminder_at = null;
      } else if (action.reminder_at_patch === "set") {
        if (!action.reminder_at) {
          return fail(action.type, "חסר זמן תזכורת מפורש.");
        }
        nextReminderAt = action.reminder_at;
        patch.reminder_at = nextReminderAt;
      }
      if (action.plan_patch === "clear") {
        nextPlannedStart = null;
        if (action.planned_date) {
          await removeDayPlanItem(db, userId, action.planned_date, action.id);
        }
      } else if (action.plan_patch === "set") {
        const planned = resolvePlannedWindow(
          action.planned_date,
          action.planned_start_time,
          action.planned_end_time,
        );
        if (!planned.ok) return fail(action.type, planned.error);
        nextPlannedStart = planned.start;
        if (action.planned_date) {
          await upsertDayPlanItem(db, userId, action.planned_date, {
            task_id: action.id,
            start_at: planned.start,
            end_at: planned.end,
            kind: "flexible",
            source: "manual",
          });
          const priorDates = new Set<string>();
          if (current.due_on && current.due_on !== action.planned_date) {
            priorDates.add(current.due_on);
          }
          for (const prior of priorDates) {
            await removeDayPlanItem(db, userId, prior, action.id);
          }
        }
      }
      Object.assign(
        patch,
        reminderResetIfNeeded(
          {
            reminder_at: current.reminder_at,
            due_at: current.due_at,
            planned_start_at: current.planned_start_at,
            reminder_enabled: current.reminder_enabled,
            reminder_offset_minutes: current.reminder_offset_minutes,
          },
          {
            reminder_at: nextReminderAt,
            due_at: nextDueAt,
            planned_start_at: nextPlannedStart,
            reminder_enabled: nextEnabled,
            reminder_offset_minutes: nextOffset,
          },
        ),
      );
      const { error } = await db
        .from("tasks")
        .update(patch)
        .eq("user_id", userId)
        .eq("id", action.id);
      if (error) return fail(action.type, "לא הצלחנו לעדכן את המשימה.");
      return ok(action.type, {
        id: action.id,
        title: action.title,
        due_on: nextDueOn,
        due_time: dueTimeFromDueAt(nextDueAt),
      });
    }
    case "task.reschedule": {
      if (!action.id) return fail(action.type, "חסר מזהה משימה.");
      const current = await ownTask(db, userId, action.id);
      if (!current) return fail(action.type, "המשימה לא נמצאה.");
      const deadline =
        action.due_patch === "clear"
          ? resolveTaskDeadline(null, null)
          : resolveTaskDeadline(action.due_on, action.due_time);
      if (!deadline.ok) return fail(action.type, deadline.error);
      const dueChanged =
        current.due_on !== deadline.due_on || current.due_at !== deadline.due_at;
      const patch: Record<string, unknown> = {
        due_on: deadline.due_on,
        due_at: deadline.due_at,
        updated_at: now,
        ...reminderResetIfNeeded(
          {
            reminder_at: current.reminder_at,
            due_at: current.due_at,
            planned_start_at: current.planned_start_at,
            reminder_enabled: current.reminder_enabled,
            reminder_offset_minutes: current.reminder_offset_minutes,
          },
          {
            reminder_at: current.reminder_at,
            due_at: deadline.due_at,
            planned_start_at: current.planned_start_at,
            reminder_enabled: current.reminder_enabled,
            reminder_offset_minutes: current.reminder_offset_minutes,
          },
        ),
      };
      if (dueChanged) {
        patch.reschedule_count = (current.reschedule_count ?? 0) + 1;
        patch.last_rescheduled_at = now;
      }
      const { error } = await db
        .from("tasks")
        .update(patch)
        .eq("user_id", userId)
        .eq("id", action.id);
      if (error) return fail(action.type, "לא הצלחנו לשנות את התאריך.");
      return ok(action.type, {
        id: action.id,
        title: action.title,
        due_on: deadline.due_on,
        due_time: deadline.due_time,
      });
    }
    case "task.complete": {
      if (!action.id) return fail(action.type, "חסר מזהה משימה.");
      if (!(await ownTask(db, userId, action.id)))
        return fail(action.type, "המשימה לא נמצאה.");
      const { error } = await db
        .from("tasks")
        .update({ status: "done", completed_at: now, updated_at: now })
        .eq("user_id", userId)
        .eq("id", action.id);
      if (error) return fail(action.type, "לא הצלחנו לסמן את המשימה כבוצעה.");
      return ok(action.type, { id: action.id, title: action.title });
    }
    case "task.reopen": {
      if (!action.id) return fail(action.type, "חסר מזהה משימה.");
      if (!(await ownTask(db, userId, action.id)))
        return fail(action.type, "המשימה לא נמצאה.");
      const { error } = await db
        .from("tasks")
        .update({ status: "open", completed_at: null, updated_at: now })
        .eq("user_id", userId)
        .eq("id", action.id);
      if (error) return fail(action.type, "לא הצלחנו לפתוח מחדש את המשימה.");
      return ok(action.type, { id: action.id, title: action.title });
    }
    case "task.delete": {
      if (!action.id) return fail(action.type, "חסר מזהה משימה.");
      if (!(await ownTask(db, userId, action.id)))
        return fail(action.type, "המשימה לא נמצאה.");
      const { error } = await db
        .from("tasks")
        .update({ status: "cancelled", updated_at: now })
        .eq("user_id", userId)
        .eq("id", action.id);
      if (error) return fail(action.type, "לא הצלחנו למחוק את המשימה.");
      return ok(action.type, { id: action.id, title: action.title });
    }
    case "task.subtask.add": {
      if (!action.task_id || !action.title) {
        return fail(action.type, "חסרים פרטי תת־משימה.");
      }
      try {
        await mutateSubtask(db, userId, {
          action: "add",
          task_id: action.task_id,
          title: action.title,
        });
      } catch {
        return fail(action.type, "לא הצלחנו להוסיף תת־משימה.");
      }
      return ok(action.type, { title: action.title });
    }
    case "task.subtask.update": {
      if (!action.id || !action.title) {
        return fail(action.type, "חסרים פרטי תת־משימה.");
      }
      try {
        await mutateSubtask(db, userId, {
          action: "update",
          id: action.id,
          title: action.title,
        });
      } catch {
        return fail(action.type, "לא הצלחנו לעדכן תת־משימה.");
      }
      return ok(action.type, { id: action.id, title: action.title });
    }
    case "task.subtask.toggle": {
      if (!action.id || action.done == null) {
        return fail(action.type, "חסר מצב סימון לתת־משימה.");
      }
      try {
        await mutateSubtask(db, userId, {
          action: "toggle",
          id: action.id,
          done: action.done === true,
        });
      } catch {
        return fail(action.type, "לא הצלחנו לעדכן תת־משימה.");
      }
      return ok(action.type, { id: action.id, title: action.title });
    }
    case "task.subtask.remove": {
      if (!action.id) return fail(action.type, "חסר מזהה תת־משימה.");
      try {
        await mutateSubtask(db, userId, { action: "remove", id: action.id });
      } catch {
        return fail(action.type, "לא הצלחנו למחוק תת־משימה.");
      }
      return ok(action.type, { id: action.id, title: action.title });
    }
    case "memory.upsert": {
      if (!action.content) return fail(action.type, "חסר תוכן לזיכרון.");
      const kind = action.kind ?? "preference";
      const confidence = action.confidence ?? "medium";
      const source = action.silent === true ? "agent" : "user";
      const seen_at = action.silent === true ? null : now;

      // Explicit id update — edit one row only; never wipe siblings.
      if (action.id) {
        if (!(await ownMemory(db, userId, action.id)))
          return fail(action.type, "הזיכרון לא נמצא.");
        const relation = parseActionFollowupRelation(action.content);
        const content = relation
          ? encodeActionFollowupRelation({
              trigger: relation.trigger,
              followup: relation.followupTitle,
              ordering: relation.ordering,
            })
          : action.content;
        const decision = reconcileMemoryWrite({
          content,
          kind,
          existing: [],
        });
        const { error } = await db
          .from("agent_memory")
          .update({
            content,
            kind,
            confidence,
            source,
            seen_at,
            updated_at: now,
            active: true,
            scope: decision.mode === "exception" ? "temporary" : "always",
            category:
              decision.mode === "exception"
                ? "exception"
                : decision.category,
          })
          .eq("user_id", userId)
          .eq("id", action.id);
        if (error) return fail(action.type, "לא הצלחנו לעדכן את הזיכרון.");
        return ok(action.type, { id: action.id, silent: action.silent === true });
      }

      const existing = await loadMemory(db, userId, { includeInactive: true });
      const decision = reconcileMemoryWrite({
        content: action.content,
        kind,
        existing,
      });
      const relation = parseActionFollowupRelation(action.content);
      const content = relation
        ? encodeActionFollowupRelation({
            trigger: relation.trigger,
            followup: relation.followupTitle,
            ordering: relation.ordering,
          })
        : action.content;

      if (decision.mode === "update") {
        const { error } = await db
          .from("agent_memory")
          .update({
            content,
            kind,
            confidence,
            source,
            seen_at,
            updated_at: now,
            active: true,
            scope: decision.scope,
            category: decision.category,
          })
          .eq("user_id", userId)
          .eq("id", decision.id);
        if (error) return fail(action.type, "לא הצלחנו לעדכן את הזיכרון.");
        return ok(action.type, {
          id: decision.id,
          silent: action.silent === true,
        });
      }

      if (
        decision.mode === "insert" &&
        /מעכשיו|מעתה|מהיום/.test(action.content)
      ) {
        const topic = preferenceTopicKey(action.content);
        if (topic) {
          for (const row of existing.filter((item) => item.active !== false)) {
            if (preferenceTopicKey(row.content) === topic) {
              await db
                .from("agent_memory")
                .update({ active: false, updated_at: now })
                .eq("user_id", userId)
                .eq("id", row.id);
            }
          }
        }
      }

      const { data, error } = await db
        .from("agent_memory")
        .insert({
          user_id: userId,
          kind,
          content,
          confidence,
          source,
          seen_at,
          updated_at: now,
          active: true,
          scope: decision.scope,
          category: decision.category,
        })
        .select("id")
        .single();
      if (error || !data)
        return fail(action.type, "לא הצלחנו לשמור את הזיכרון.");
      return ok(action.type, {
        id: data.id as string,
        silent: action.silent === true,
      });
    }
    case "memory.remove": {
      if (!action.id) return fail(action.type, "חסר מזהה זיכרון.");
      if (!(await ownMemory(db, userId, action.id)))
        return fail(action.type, "הזיכרון לא נמצא.");
      const { error } = await db
        .from("agent_memory")
        .update({ active: false, updated_at: now })
        .eq("user_id", userId)
        .eq("id", action.id);
      if (error) return fail(action.type, "לא הצלחנו למחוק את הזיכרון.");
      return ok(action.type, { id: action.id });
    }
    case "shopping.add": {
      if (!action.title || action.quantity == null) return fail(action.type, "חסר פריט קניות תקין.");
      try {
        await mutateShopping(db, userId, { action: "add", title: action.title, quantity: action.quantity });
      } catch {
        return fail(action.type, "לא הצלחנו להוסיף לרשימת הקניות.");
      }
      return ok(action.type, { title: action.title });
    }
    case "shopping.update": {
      if (!action.id) return fail(action.type, "חסר מזהה פריט.");
      try {
        await mutateShopping(db, userId, { action: "update", id: action.id, ...(action.title ? { title: action.title } : {}), ...(action.quantity != null ? { quantity: action.quantity } : {}) });
      } catch {
        return fail(action.type, "לא הצלחנו לעדכן את פריט הקניות.");
      }
      return ok(action.type, { id: action.id, title: action.title });
    }
    case "shopping.toggle": {
      if (!action.id || action.purchased == null) return fail(action.type, "חסר מצב קנייה תקין.");
      try {
        await mutateShopping(db, userId, { action: "toggle", id: action.id, purchased: action.purchased });
      } catch {
        return fail(action.type, "לא הצלחנו לעדכן את מצב הקנייה.");
      }
      return ok(action.type, {
        id: action.id,
        title: action.title,
        purchased: action.purchased === true,
      });
    }
    case "shopping.remove": {
      if (!action.id) return fail(action.type, "חסר מזהה פריט.");
      try {
        await mutateShopping(db, userId, { action: "remove", id: action.id });
      } catch {
        return fail(action.type, "לא הצלחנו להסיר את פריט הקניות.");
      }
      return ok(action.type, { id: action.id, title: action.title });
    }
    case "checklist.create": {
      if (!action.title) return fail(action.type, "חסר שם רשימה.");
      try {
        await mutateChecklist(db, userId, { action: "create", title: action.title });
      } catch {
        return fail(action.type, "לא הצלחנו ליצור את הרשימה.");
      }
      return ok(action.type, { title: action.title });
    }
    case "checklist.rename": {
      if (!action.id || !action.title) return fail(action.type, "חסרים פרטי הרשימה.");
      try {
        await mutateChecklist(db, userId, { action: "rename", id: action.id, title: action.title });
      } catch {
        return fail(action.type, "לא הצלחנו לשנות את שם הרשימה.");
      }
      return ok(action.type, { id: action.id, title: action.title });
    }
    case "checklist.delete": {
      if (!action.id) return fail(action.type, "חסר מזהה רשימה.");
      try {
        await mutateChecklist(db, userId, { action: "delete", id: action.id });
      } catch {
        return fail(action.type, "לא הצלחנו למחוק את הרשימה.");
      }
      return ok(action.type, { id: action.id, title: action.title });
    }
    case "checklist.item.add": {
      if (!action.checklist_id || !action.text) return fail(action.type, "חסרים פרטי הפריט.");
      try {
        await mutateChecklist(db, userId, { action: "item.add", checklist_id: action.checklist_id, text: action.text });
      } catch {
        return fail(action.type, "לא הצלחנו להוסיף פריט לרשימה.");
      }
      return ok(action.type, { title: action.text });
    }
    case "checklist.item.update": {
      if (!action.checklist_id || !action.id || !action.text) return fail(action.type, "חסרים פרטי הפריט.");
      try {
        await mutateChecklist(db, userId, { action: "item.update", checklist_id: action.checklist_id, id: action.id, text: action.text });
      } catch {
        return fail(action.type, "לא הצלחנו לעדכן את הפריט.");
      }
      return ok(action.type, { id: action.id, title: action.text });
    }
    case "checklist.item.toggle": {
      if (!action.checklist_id || !action.id || action.checked == null) return fail(action.type, "חסר מצב סימון תקין.");
      try {
        await mutateChecklist(db, userId, { action: "item.toggle", checklist_id: action.checklist_id, id: action.id, checked: action.checked });
      } catch {
        return fail(action.type, "לא הצלחנו לעדכן את הסימון.");
      }
      return ok(action.type, { id: action.id, title: action.title });
    }
    case "checklist.item.remove": {
      if (!action.checklist_id || !action.id) return fail(action.type, "חסרים פרטי הפריט.");
      try {
        await mutateChecklist(db, userId, { action: "item.remove", checklist_id: action.checklist_id, id: action.id });
      } catch {
        return fail(action.type, "לא הצלחנו להסיר את הפריט.");
      }
      return ok(action.type, { id: action.id, title: action.title });
    }
    default:
      return fail(action.type, "הפעולה זמינה רק דרך מבצע הפעולות האטומי.");
  }
}

export async function executeActions(
  db: Db,
  userId: string,
  actions: AgentAction[],
) {
  const results: ActionResult[] = [];
  for (const action of actions) {
    results.push(await executeAction(db, userId, action));
  }
  return results;
}

export async function runRequestedActions(
  db: Db,
  userId: string,
  raw: unknown,
) {
  const inspected = inspectActions(raw);
  for (const result of inspected.results) {
    if (!result.ok) {
      console.error("Lean action rejected", {
        type: result.type,
        detail: result.detail ?? "execute",
      });
    }
  }
  const executed = await executeActions(db, userId, inspected.accepted);
  return [...inspected.results, ...executed];
}

export async function loadTasks(db: Db, userId: string): Promise<TaskRow[]> {
  const { data, error } = await db
    .from("tasks")
    .select(
      "id,title,notes,status,due_on,due_at,reminder_at,reminder_offset_minutes,reminder_enabled,reminder_sent_at,reminder_claimed_at,planned_start_at,planned_end_at,reschedule_count,last_rescheduled_at,created_at,updated_at,completed_at",
    )
    .eq("user_id", userId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) throw error;
  return (data ?? []) as TaskRow[];
}

/**
 * Wider open-task pool for agent candidate selection.
 * Fetches more rows then leaves ranking/truncation to compact context.
 */
export async function loadOpenTasksForAgent(
  db: Db,
  userId: string,
  limit = 200,
): Promise<TaskRow[]> {
  const capped = Math.min(Math.max(limit, 80), 300);
  const { data, error } = await db
    .from("tasks")
    .select(
      "id,title,notes,status,due_on,due_at,reminder_at,reminder_offset_minutes,reminder_enabled,reminder_sent_at,reminder_claimed_at,planned_start_at,planned_end_at,reschedule_count,last_rescheduled_at,created_at,updated_at,completed_at",
    )
    .eq("user_id", userId)
    .eq("status", "open")
    .order("updated_at", { ascending: false })
    .limit(capped);
  if (error) throw error;
  return (data ?? []) as TaskRow[];
}

export async function loadMemory(
  db: Db,
  userId: string,
  options: { includeInactive?: boolean } = {},
): Promise<MemoryRow[]> {
  const fullSelect =
    "id,kind,content,confidence,source,seen_at,created_at,updated_at,active,scope,category,supersedes";
  const baseSelect =
    "id,kind,content,confidence,source,seen_at,created_at,updated_at";
  let query = db
    .from("agent_memory")
    .select(fullSelect)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(60);
  if (!options.includeInactive) {
    query = query.eq("active", true);
  }
  let { data, error } = await query;
  if (error) {
    const missingNewCols = /active|scope|category|supersedes|PGRST204/i.test(
      error.message ?? "",
    );
    if (!missingNewCols) throw error;
    const fallback = await db
      .from("agent_memory")
      .select(baseSelect)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(60);
    if (fallback.error) throw fallback.error;
    // Legacy rows lack active/scope/category/supersedes — cast via MemoryRow defaults.
    return (fallback.data ?? []) as MemoryRow[];
  }
  return (data ?? []) as MemoryRow[];
}

export async function clearUserTasks(db: Db, userId: string) {
  const now = new Date().toISOString();
  const { error } = await db
    .from("tasks")
    .update({ status: "cancelled", updated_at: now })
    .eq("user_id", userId)
    .in("status", ["open", "done"]);
  if (error) throw error;
  return loadTasks(db, userId);
}

export async function loadScheduleTasks(db: Db, userId: string) {
  const { data, error } = await db
    .from("tasks")
    .select(
      "id,title,notes,status,due_on,due_at,reminder_at,reminder_offset_minutes,reminder_enabled,reminder_sent_at,reminder_claimed_at,planned_start_at,planned_end_at,reschedule_count,last_rescheduled_at,created_at,updated_at,completed_at",
    )
    .eq("user_id", userId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as TaskRow[];
}

export async function saveTaskPlans(
  db: Db,
  userId: string,
  date: string,
  items: Array<{
    task_id?: string | null;
    title?: string | null;
    planned_start: string;
    planned_end: string | null;
    anchor?: "fixed" | "planned" | null;
  }>,
) {
  if (!DATE_RE.test(date)) throw new Error("invalid_date");
  const { updateDayPlan } = await import("./day-plan.ts");
  const blank: AgentAction = {
    type: "task.create",
    id: null,
    title: null,
    notes: null,
    due_on: null,
    due_time: null,
    due_patch: null,
    reminder_enabled: null,
    reminder_at: null,
    reminder_at_patch: null,
    reminder_offset_minutes: null,
    reminder_patch: null,
    plan_patch: null,
    planned_date: null,
    planned_start_time: null,
    planned_end_time: null,
    kind: null,
    content: null,
    confidence: null,
    silent: null,
  };
  const planItems: Array<{
    task_id: string;
    start_at: string;
    end_at: string | null;
    kind: "fixed" | "flexible";
    source: "manual";
  }> = [];
  for (const item of items.slice(0, 20)) {
    let taskId = item.task_id || "";
    if (taskId) {
      const current = await ownTask(db, userId, taskId);
      if (!current) throw new Error("forbidden_task");
    } else {
      const title = item.title?.trim() || "";
      if (!title) continue;
      const create = await executeAction(db, userId, {
        ...blank,
        title,
        ...(item.anchor === "fixed"
          ? { due_on: date, due_time: item.planned_start }
          : {}),
      });
      if (!create.ok || !create.id) {
        throw new Error(create.ok ? "create_failed" : create.error);
      }
      taskId = create.id;
    }
    const planned = resolvePlannedWindow(
      date,
      item.planned_start,
      item.planned_end,
    );
    if (!planned.ok) throw new Error(planned.error);
    planItems.push({
      task_id: taskId,
      start_at: planned.start,
      end_at: planned.end,
      kind: item.anchor === "fixed" ? "fixed" : "flexible",
      source: "manual",
    });
  }
  await updateDayPlan(db, userId, date, planItems);
  return loadTasks(db, userId);
}
