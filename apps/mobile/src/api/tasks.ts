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
};

async function persistAndSync(body: Record<string, unknown>) {
  const data = await apiRequest<{ tasks: MobileTask[] }>("/api/tasks", {
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

export async function createTask(title: string, extra?: { reminderAt?: string }) {
  return persistAndSync({
    type: "task.create",
    title,
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

export async function completeTask(id: string) {
  return persistAndSync({ type: "task.complete", id });
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
