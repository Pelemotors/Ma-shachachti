import { syncLocalReminders } from "../notifications/localReminders";
import { apiRequest } from "./client";

export type MobileTask = {
  id: string;
  title: string;
  status: "open" | "done" | "cancelled";
  due_on: string | null;
  due_at: string | null;
  reminder_enabled?: boolean;
  reminder_at?: string | null;
  planned_start_at?: string | null;
  planned_end_at?: string | null;
  notes?: string | null;
  estimate_minutes?: number | null;
  checklist_id?: string | null;
};

export type TaskWriteResult = { ok: boolean; id?: string; error?: string };

async function persistAndSync(body: Record<string, unknown>) {
  const data = await apiRequest<{ tasks: MobileTask[]; results?: TaskWriteResult[] }>("/api/tasks", {
    method: "POST",
    body: JSON.stringify(body),
  });
  await syncLocalReminders(data.tasks ?? []).catch((err) => {
    console.warn("[localReminders] sync after persist failed", err);
  });
  return data;
}

export async function listTasks() {
  const data = await apiRequest<{ tasks: MobileTask[] }>("/api/tasks");
  await syncLocalReminders(data.tasks ?? []).catch((err) => {
    console.warn("[localReminders] sync after list failed", err);
  });
  return data;
}

export async function createTask(title: string, extra?: { reminderAt?: string; notes?: string; dueOn?: string; dueTime?: string; estimateMinutes?: number; checklistId?: string }) {
  return persistAndSync({
    type: "task.create",
    title,
    ...(extra?.notes ? { notes: extra.notes } : {}),
    ...(extra?.dueOn ? { due_on: extra.dueOn, due_patch: "set" } : {}),
    ...(extra?.dueTime ? { due_time: extra.dueTime, due_patch: "set" } : {}),
    ...(extra?.estimateMinutes ? { estimate_minutes: extra.estimateMinutes } : {}),
    ...(extra?.checklistId ? { checklist_id: extra.checklistId } : {}),
    ...(extra?.reminderAt
      ? {
          reminder_patch: "set",
          reminder_enabled: true,
          reminder_at_patch: "set",
          reminder_at: extra.reminderAt,
        }
      : {}),
  });
}

export async function updateTask(id: string, patch: Record<string, unknown>) {
  return persistAndSync({ type: "task.update", id, ...patch });
}

export async function completeTask(id: string, occurrenceDate?: string) {
  return persistAndSync({
    type: "task.complete",
    id,
    ...(occurrenceDate ? { occurrence_date: occurrenceDate, series_scope: "once" } : {}),
  });
}

export async function reopenTask(id: string, occurrenceDate?: string) {
  return persistAndSync({
    type: "task.reopen",
    id,
    ...(occurrenceDate ? { occurrence_date: occurrenceDate } : {}),
  });
}

export async function duplicateTask(id: string) {
  return persistAndSync({ type: "task.duplicate", id });
}

export async function deleteTask(id: string) {
  return persistAndSync({ type: "task.delete", id });
}

export async function enableTaskReminder(id: string) {
  return persistAndSync({
    type: "task.update",
    id,
    reminder_patch: "set",
    reminder_enabled: true,
  });
}

export async function setTaskReminder(id: string, reminderAt: string) {
  return persistAndSync({
    type: "task.update",
    id,
    reminder_patch: "set",
    reminder_enabled: true,
    reminder_at_patch: "set",
    reminder_at: reminderAt,
  });
}
