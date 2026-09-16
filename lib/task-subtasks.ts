import type { SupabaseClient } from "@supabase/supabase-js";

export class SubtaskError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type TaskSubtaskRow = {
  id: string;
  task_id: string;
  user_id?: string;
  title: string;
  done: boolean;
  order_index: number;
  created_at: string;
  updated_at: string;
};

export const TASK_SUBTASK_SELECT =
  "id,task_id,title,done,order_index,created_at,updated_at";

type Db = SupabaseClient;

export async function loadSubtasksForTasks(
  db: Db,
  userId: string,
  taskIds: string[],
): Promise<TaskSubtaskRow[]> {
  if (!taskIds.length) return [];
  const { data, error } = await db
    .from("task_subtasks")
    .select(TASK_SUBTASK_SELECT)
    .eq("user_id", userId)
    .in("task_id", taskIds)
    .order("order_index", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new SubtaskError(503, "לא הצלחנו לטעון תתי־משימות.");
  return (data ?? []) as TaskSubtaskRow[];
}

export async function loadSubtasksForTask(
  db: Db,
  userId: string,
  taskId: string,
): Promise<TaskSubtaskRow[]> {
  return loadSubtasksForTasks(db, userId, [taskId]);
}

export type SubtaskMutation =
  | { action: "add"; task_id: string; title: string }
  | { action: "update"; id: string; title: string }
  | { action: "toggle"; id: string; done: boolean }
  | { action: "remove"; id: string }
  | { action: "reorder"; task_id: string; ordered_ids: string[] };

async function ownTask(db: Db, userId: string, taskId: string) {
  const { data, error } = await db
    .from("tasks")
    .select("id")
    .eq("user_id", userId)
    .eq("id", taskId)
    .neq("status", "cancelled")
    .maybeSingle();
  if (error) throw new SubtaskError(503, "לא הצלחנו לבדוק את המשימה.");
  return Boolean(data);
}

async function ownSubtask(db: Db, userId: string, id: string) {
  const { data, error } = await db
    .from("task_subtasks")
    .select("id,task_id")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new SubtaskError(503, "לא הצלחנו לבדוק את תת־המשימה.");
  return data as { id: string; task_id: string } | null;
}

export async function mutateSubtask(
  db: Db,
  userId: string,
  mutation: SubtaskMutation,
): Promise<TaskSubtaskRow[]> {
  const now = new Date().toISOString();
  switch (mutation.action) {
    case "add": {
      const title = mutation.title.trim().slice(0, 200);
      if (!title) throw new SubtaskError(400, "חסרה כותרת לתת־משימה.");
      if (!(await ownTask(db, userId, mutation.task_id))) {
        throw new SubtaskError(404, "המשימה לא נמצאה.");
      }
      const existing = await loadSubtasksForTask(db, userId, mutation.task_id);
      const order_index =
        existing.reduce((max, row) => Math.max(max, row.order_index), -1) + 1;
      const { error } = await db.from("task_subtasks").insert({
        task_id: mutation.task_id,
        user_id: userId,
        title,
        done: false,
        order_index,
        created_at: now,
        updated_at: now,
      });
      if (error) throw new SubtaskError(503, "לא הצלחנו להוסיף תת־משימה.");
      return loadSubtasksForTask(db, userId, mutation.task_id);
    }
    case "update": {
      const title = mutation.title.trim().slice(0, 200);
      if (!title) throw new SubtaskError(400, "חסרה כותרת לתת־משימה.");
      const row = await ownSubtask(db, userId, mutation.id);
      if (!row) throw new SubtaskError(404, "תת־המשימה לא נמצאה.");
      const { error } = await db
        .from("task_subtasks")
        .update({ title, updated_at: now })
        .eq("user_id", userId)
        .eq("id", mutation.id);
      if (error) throw new SubtaskError(503, "לא הצלחנו לעדכן תת־משימה.");
      return loadSubtasksForTask(db, userId, row.task_id);
    }
    case "toggle": {
      const row = await ownSubtask(db, userId, mutation.id);
      if (!row) throw new SubtaskError(404, "תת־המשימה לא נמצאה.");
      const { error } = await db
        .from("task_subtasks")
        .update({ done: mutation.done, updated_at: now })
        .eq("user_id", userId)
        .eq("id", mutation.id);
      if (error) throw new SubtaskError(503, "לא הצלחנו לעדכן תת־משימה.");
      return loadSubtasksForTask(db, userId, row.task_id);
    }
    case "remove": {
      const row = await ownSubtask(db, userId, mutation.id);
      if (!row) throw new SubtaskError(404, "תת־המשימה לא נמצאה.");
      const { error } = await db
        .from("task_subtasks")
        .delete()
        .eq("user_id", userId)
        .eq("id", mutation.id);
      if (error) throw new SubtaskError(503, "לא הצלחנו למחוק תת־משימה.");
      return loadSubtasksForTask(db, userId, row.task_id);
    }
    case "reorder": {
      if (!(await ownTask(db, userId, mutation.task_id))) {
        throw new SubtaskError(404, "המשימה לא נמצאה.");
      }
      for (let index = 0; index < mutation.ordered_ids.length; index += 1) {
        const id = mutation.ordered_ids[index];
        const { error } = await db
          .from("task_subtasks")
          .update({ order_index: index, updated_at: now })
          .eq("user_id", userId)
          .eq("task_id", mutation.task_id)
          .eq("id", id);
        if (error) throw new SubtaskError(503, "לא הצלחנו לסדר תתי־משימות.");
      }
      return loadSubtasksForTask(db, userId, mutation.task_id);
    }
    default:
      throw new SubtaskError(400, "פעולת תת־משימה לא נתמכת.");
  }
}
