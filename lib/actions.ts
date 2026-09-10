import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type {
  ActionResult,
  ActionType,
  AgentAction,
  MemoryRow,
  TaskRow,
} from "@/lib/types";
import { ACTION_TYPES } from "@/lib/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const ActionSchema = z.object({
  type: z.enum(ACTION_TYPES),
  id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  due_on: z.string().regex(DATE_RE).nullable().optional(),
  kind: z.enum(["preference", "fact"]).nullable().optional(),
  content: z.string().trim().min(1).max(500).nullable().optional(),
  confidence: z.enum(["low", "medium", "high"]).nullable().optional(),
});

type Db = SupabaseClient;

export function parseActions(raw: unknown): AgentAction[] {
  if (!Array.isArray(raw)) return [];
  const actions: AgentAction[] = [];
  for (const item of raw.slice(0, 10)) {
    const parsed = ActionSchema.safeParse(item);
    if (!parsed.success) continue;
    actions.push({
      type: parsed.data.type,
      id: parsed.data.id ?? null,
      title: parsed.data.title ?? null,
      notes: parsed.data.notes ?? null,
      due_on: parsed.data.due_on ?? null,
      kind: parsed.data.kind ?? null,
      content: parsed.data.content ?? null,
      confidence: parsed.data.confidence ?? null,
    });
  }
  return actions;
}

function fail(type: ActionType, error: string): ActionResult {
  return { ok: false, type, error };
}

async function ownTask(db: Db, userId: string, id: string) {
  const { data, error } = await db
    .from("tasks")
    .select("id")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return false;
  return true;
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
      const { data, error } = await db
        .from("tasks")
        .insert({
          user_id: userId,
          title: action.title,
          notes: action.notes ?? "",
          due_on: action.due_on,
          status: "open",
          updated_at: now,
        })
        .select("id")
        .single();
      if (error || !data)
        return fail(action.type, "לא הצלחנו ליצור את המשימה.");
      return { ok: true, type: action.type, id: data.id as string };
    }
    case "task.update": {
      if (!action.id) return fail(action.type, "חסר מזהה משימה.");
      if (!(await ownTask(db, userId, action.id)))
        return fail(action.type, "המשימה לא נמצאה.");
      const patch: Record<string, unknown> = { updated_at: now };
      if (action.title) patch.title = action.title;
      if (action.notes != null) patch.notes = action.notes;
      if (action.due_on !== undefined && action.due_on !== null)
        patch.due_on = action.due_on;
      const { error } = await db
        .from("tasks")
        .update(patch)
        .eq("user_id", userId)
        .eq("id", action.id);
      if (error) return fail(action.type, "לא הצלחנו לעדכן את המשימה.");
      return { ok: true, type: action.type, id: action.id };
    }
    case "task.reschedule": {
      if (!action.id || !action.due_on)
        return fail(action.type, "חסרים מזהה או תאריך.");
      if (!(await ownTask(db, userId, action.id)))
        return fail(action.type, "המשימה לא נמצאה.");
      const { error } = await db
        .from("tasks")
        .update({ due_on: action.due_on, updated_at: now })
        .eq("user_id", userId)
        .eq("id", action.id);
      if (error) return fail(action.type, "לא הצלחנו לשנות את התאריך.");
      return { ok: true, type: action.type, id: action.id };
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
      return { ok: true, type: action.type, id: action.id };
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
      return { ok: true, type: action.type, id: action.id };
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
      return { ok: true, type: action.type, id: action.id };
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
        return { ok: true, type: action.type, id: action.id };
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
      return { ok: true, type: action.type, id: data.id as string };
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
      return { ok: true, type: action.type, id: action.id };
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

export async function loadTasks(db: Db, userId: string): Promise<TaskRow[]> {
  const { data, error } = await db
    .from("tasks")
    .select("id,title,notes,status,due_on,created_at,updated_at,completed_at")
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

export function groundReply(reply: string, results: ActionResult[]) {
  const failed = results.filter((result) => !result.ok);
  if (!failed.length) return reply.trim();
  return `${reply.trim()}\n\nחלק מהפעולות לא נשמרו. אפשר לנסות שוב.`;
}
