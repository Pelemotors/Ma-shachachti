import { apiRequest } from "./client";

export type MobileTask = {
  id: string;
  title: string;
  status: "open" | "done" | "cancelled";
  due_on: string | null;
  due_at: string | null;
};

export async function listTasks() {
  return apiRequest<{ tasks: MobileTask[] }>("/api/tasks");
}

export async function createTask(title: string) {
  return apiRequest<{ tasks: MobileTask[] }>("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ type: "task.create", title }),
  });
}

export async function completeTask(id: string) {
  return apiRequest<{ tasks: MobileTask[] }>("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ type: "task.complete", id }),
  });
}
