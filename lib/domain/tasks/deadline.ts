import type { Task } from "@/lib/model";
import { dayKey } from "@/lib/time";

export type TaskDeadline = NonNullable<Task["deadline"]>;

export function deadlineFromDueAt(
  dueAt: string,
  timezone: string,
): TaskDeadline {
  const date = dayKey(new Date(dueAt), timezone);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(dueAt));
  return {
    date,
    time,
    timezone,
    precision: "datetime",
  };
}

export function deadlineFromDate(
  dateKey: string,
  timezone: string,
): TaskDeadline {
  return {
    date: dateKey,
    time: null,
    timezone,
    precision: "date",
  };
}

export function normalizeTaskDeadline(
  task: Task,
  timezone: string,
): Task {
  if (task.deadline) return task;
  if (!task.dueAt) return { ...task, deadline: null };
  return { ...task, deadline: deadlineFromDueAt(task.dueAt, timezone) };
}

export function deadlineConflictEvidence(
  task: Task,
  scheduledFor: { date: string; plannedStart: string | null },
): {
  taskId: string;
  deadline: TaskDeadline;
  scheduledFor: { date: string; plannedStart: string | null };
  relation: "after_deadline";
} | null {
  if (!task.deadline) return null;
  if (scheduledFor.date > task.deadline.date) {
    return {
      taskId: task.id,
      deadline: task.deadline,
      scheduledFor,
      relation: "after_deadline",
    };
  }
  if (
    task.deadline.precision === "datetime" &&
    task.dueAt &&
    scheduledFor.plannedStart &&
    Date.parse(scheduledFor.plannedStart) > Date.parse(task.dueAt)
  ) {
    return {
      taskId: task.id,
      deadline: task.deadline,
      scheduledFor,
      relation: "after_deadline",
    };
  }
  return null;
}
