import { UUID_RE } from "./action-schema.ts";
import type { ClientPresentation, PresentedTask, TaskRow } from "./types.ts";

function toPresentedTask(task: TaskRow): PresentedTask {
  return {
    id: task.id,
    title: task.title,
    notes: task.notes,
    status: task.status,
    due_on: task.due_on,
    due_at: task.due_at,
  };
}

export function resolveTaskListPresentation(
  presentation: unknown,
  tasks: TaskRow[],
): ClientPresentation | null {
  if (
    !presentation ||
    typeof presentation !== "object" ||
    Array.isArray(presentation)
  ) {
    return null;
  }
  const raw = presentation as { type?: unknown; task_ids?: unknown };
  if (raw.type !== "task_list" || !Array.isArray(raw.task_ids)) return null;

  const byId = new Map(tasks.map((task) => [task.id, task]));
  const seen = new Set<string>();
  const resolved: PresentedTask[] = [];

  for (const value of raw.task_ids.slice(0, 20)) {
    if (typeof value !== "string" || !UUID_RE.test(value) || seen.has(value)) {
      continue;
    }
    const task = byId.get(value);
    if (!task) continue;
    seen.add(value);
    resolved.push(toPresentedTask(task));
  }

  if (!resolved.length) return null;
  return { type: "task_list", tasks: resolved };
}
