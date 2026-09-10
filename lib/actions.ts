import type { SupabaseClient } from "@supabase/supabase-js";
import { inspectActions } from "./action-schema.ts";
import { exactTaskFields, isExactOpenDuplicate } from "./task-identity.ts";
import { dueTimeFromDueAt, resolveTaskDeadline } from "./time.ts";
import type {
  ActionResult,
  ActionType,
  AgentAction,
  MemoryRow,
  TaskRow,
} from "./types.ts";

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
  } = {},
): ActionResult {
  return { ok: true, type, ...extra };
}

async function ownTask(db: Db, userId: string, id: string) {
  const { data, error } = await db
    .from("tasks")
    .select(
      "id,due_on,due_at,reminder_enabled,reminder_offset_minutes,reminder_sent_at,reminder_claimed_at",
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
    | "reminder_enabled"
    | "reminder_offset_minutes"
    | "reminder_sent_at"
    | "reminder_claimed_at"
  >;
}

function reminderResetIfNeeded(
  previous: {
    due_at: string | null;
    reminder_enabled: boolean;
    reminder_offset_minutes: number | null;
  },
  next: {
    due_at: string | null;
    reminder_enabled: boolean;
    reminder_offset_minutes: number | null;
  },
) {
  const dueChanged = previous.due_at !== next.due_at;
  const offsetChanged =
    previous.reminder_offset_minutes !== next.reminder_offset_minutes;
  const reenabled = !previous.reminder_enabled && next.reminder_enabled;
  if (dueChanged || offsetChanged || reenabled) {
    return {
      reminder_sent_at: null,
      reminder_claimed_at: null,
    };
  }
  return {};
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
      const reminderEnabled = action.reminder_enabled !== false;
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
      const { data, error } = await db
        .from("tasks")
        .insert({
          user_id: userId,
          title: fields.title,
          notes: fields.notes,
          due_on: fields.due_on,
          due_at: fields.due_at,
          reminder_enabled: reminderEnabled,
          reminder_offset_minutes: reminderOffset,
          status: "open",
          updated_at: now,
        })
        .select("id")
        .single();
      if (error || !data)
        return fail(action.type, "לא הצלחנו ליצור את המשימה.");
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
        nextEnabled = action.reminder_enabled !== false;
        nextOffset = action.reminder_offset_minutes;
        patch.reminder_enabled = nextEnabled;
        patch.reminder_offset_minutes = nextOffset;
      }
      Object.assign(
        patch,
        reminderResetIfNeeded(
          {
            due_at: current.due_at,
            reminder_enabled: current.reminder_enabled,
            reminder_offset_minutes: current.reminder_offset_minutes,
          },
          {
            due_at: nextDueAt,
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
      const patch: Record<string, unknown> = {
        due_on: deadline.due_on,
        due_at: deadline.due_at,
        updated_at: now,
        ...reminderResetIfNeeded(
          {
            due_at: current.due_at,
            reminder_enabled: current.reminder_enabled,
            reminder_offset_minutes: current.reminder_offset_minutes,
          },
          {
            due_at: deadline.due_at,
            reminder_enabled: current.reminder_enabled,
            reminder_offset_minutes: current.reminder_offset_minutes,
          },
        ),
      };
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
    case "memory.upsert": {
      if (!action.content) return fail(action.type, "חסר תוכן לזיכרון.");
      const kind = action.kind ?? "preference";
      const confidence = action.confidence ?? "medium";
      if (action.id) {
        if (!(await ownMemory(db, userId, action.id)))
          return fail(action.type, "הזיכרון לא נמצא.");
        const { error } = await db
          .from("agent_memory")
          .update({
            content: action.content,
            kind,
            confidence,
            updated_at: now,
          })
          .eq("user_id", userId)
          .eq("id", action.id);
        if (error) return fail(action.type, "לא הצלחנו לעדכן את הזיכרון.");
        return ok(action.type, { id: action.id });
      }
      const { data, error } = await db
        .from("agent_memory")
        .insert({
          user_id: userId,
          kind,
          content: action.content,
          confidence,
          updated_at: now,
        })
        .select("id")
        .single();
      if (error || !data)
        return fail(action.type, "לא הצלחנו לשמור את הזיכרון.");
      return ok(action.type, { id: data.id as string });
    }
    case "memory.remove": {
      if (!action.id) return fail(action.type, "חסר מזהה זיכרון.");
      if (!(await ownMemory(db, userId, action.id)))
        return fail(action.type, "הזיכרון לא נמצא.");
      const { error } = await db
        .from("agent_memory")
        .delete()
        .eq("user_id", userId)
        .eq("id", action.id);
      if (error) return fail(action.type, "לא הצלחנו למחוק את הזיכרון.");
      return ok(action.type, { id: action.id });
    }
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
      "id,title,notes,status,due_on,due_at,reminder_offset_minutes,reminder_enabled,reminder_sent_at,reminder_claimed_at,created_at,updated_at,completed_at",
    )
    .eq("user_id", userId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) throw error;
  return (data ?? []) as TaskRow[];
}

export async function loadMemory(db: Db, userId: string): Promise<MemoryRow[]> {
  const { data, error } = await db
    .from("agent_memory")
    .select("id,kind,content,confidence,created_at,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(40);
  if (error) throw error;
  return (data ?? []) as MemoryRow[];
}
