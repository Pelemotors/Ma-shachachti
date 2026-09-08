import { normalize } from "@/lib/model";

export function reminderSubjectKey(title: string): string {
  return normalize(title)
    .replace(/^(תזכיר(י)?( לי)?|תזכורת)\s*:?\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function reminderIdentityKey(input: {
  title: string;
  dueAt: string;
  taskId?: string | null;
}): string {
  if (input.taskId) return `task:${input.taskId}|${input.dueAt}`;
  return `title:${reminderSubjectKey(input.title)}|${input.dueAt}`;
}

export function isDuplicatePendingReminder(
  pending: {
    title: string;
    dueAt: string;
    taskId: string | null;
    status: string;
  }[],
  input: { title: string; dueAt: string; taskId?: string | null },
): boolean {
  const key = reminderIdentityKey(input);
  return pending.some(
    (r) =>
      r.status === "pending" &&
      reminderIdentityKey({
        title: r.title,
        dueAt: r.dueAt,
        taskId: r.taskId,
      }) === key,
  );
}
