import { UUID_RE } from "./action-schema.ts";
import { DATE_RE, TIME_RE, dueTimeFromDueAt, todayContext } from "./time.ts";
import type {
  ClientPresentation,
  PresentedScheduleItem,
  PresentedSuggestion,
  PresentedTask,
  TaskRow,
} from "./types.ts";

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
  options: { max?: number; openOnly?: boolean } = {},
): Extract<ClientPresentation, { type: "task_list" }> | null {
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
  const max = options.max ?? 20;

  for (const value of raw.task_ids) {
    if (resolved.length >= max) break;
    if (typeof value !== "string" || !UUID_RE.test(value) || seen.has(value)) {
      continue;
    }
    const task = byId.get(value);
    if (!task || task.status === "cancelled") continue;
    if (options.openOnly && task.status !== "open") continue;
    seen.add(value);
    resolved.push(toPresentedTask(task));
  }

  if (!resolved.length) return null;
  return { type: "task_list", tasks: resolved };
}

export function resolveSchedulePlanPresentation(
  presentation: unknown,
  tasks: TaskRow[],
  now = new Date(),
): Extract<ClientPresentation, { type: "schedule_plan" }> | null {
  if (
    !presentation ||
    typeof presentation !== "object" ||
    Array.isArray(presentation)
  ) {
    return null;
  }
  const raw = presentation as {
    type?: unknown;
    date?: unknown;
    items?: unknown;
  };
  if (raw.type !== "schedule_plan" || typeof raw.date !== "string") return null;
  if (!DATE_RE.test(raw.date) || !Array.isArray(raw.items)) return null;

  const { date: today, currentTime } = todayContext(now);
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const seen = new Set<string>();
  const items: PresentedScheduleItem[] = [];

  for (const value of raw.items.slice(0, 20)) {
    if (!value || typeof value !== "object") continue;
    const item = value as {
      task_id?: unknown;
      title?: unknown;
      planned_start?: unknown;
      planned_end?: unknown;
      anchor?: unknown;
    };
    let start =
      typeof item.planned_start === "string" && TIME_RE.test(item.planned_start)
        ? item.planned_start
        : null;
    let end =
      typeof item.planned_end === "string" && TIME_RE.test(item.planned_end)
        ? item.planned_end
        : null;
    const taskId =
      typeof item.task_id === "string" && UUID_RE.test(item.task_id)
        ? item.task_id
        : null;
    if (taskId) {
      if (seen.has(taskId)) continue;
      const task = byId.get(taskId);
      if (!task || task.status === "cancelled") continue;
      const fixed = Boolean(task.due_at);
      if (fixed && task.due_at) {
        const dueClock = dueTimeFromDueAt(task.due_at);
        const dueDate = task.due_on ?? null;
        if (!dueClock || dueDate !== raw.date) continue;
        start = dueClock;
      }
      if (!start) continue;
      if (end && end <= start) end = null;
      if (raw.date === today && start < currentTime) continue;
      seen.add(taskId);
      items.push({
        task_id: task.id,
        title: task.title,
        status: task.status,
        planned_start: start,
        planned_end: end,
        fixed,
      });
      continue;
    }
    const title = typeof item.title === "string" ? item.title.trim() : "";
    if (!title || !start) continue;
    if (end && end <= start) end = null;
    if (raw.date === today && start < currentTime) continue;
    items.push({
      task_id: null,
      title,
      status: "proposed",
      planned_start: start,
      planned_end: end,
      fixed: item.anchor === "fixed",
    });
  }

  items.sort((a, b) => a.planned_start.localeCompare(b.planned_start));
  if (!items.length) return null;
  return { type: "schedule_plan", date: raw.date, saved: false, items };
}

export function resolveSuggestionPresentation(
  presentation: unknown,
): Extract<ClientPresentation, { type: "task_suggestions" }> | null {
  if (
    !presentation ||
    typeof presentation !== "object" ||
    Array.isArray(presentation)
  ) {
    return null;
  }
  const raw = presentation as { type?: unknown; items?: unknown };
  if (raw.type !== "task_suggestions" || !Array.isArray(raw.items)) return null;
  const items: PresentedSuggestion[] = [];
  const seen = new Set<string>();
  for (const value of raw.items.slice(0, 8)) {
    if (!value || typeof value !== "object") continue;
    const item = value as { title?: unknown; reason?: unknown };
    const title = typeof item.title === "string" ? item.title.trim() : "";
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    items.push({
      title,
      reason:
        typeof item.reason === "string" && item.reason.trim()
          ? item.reason.trim()
          : null,
    });
  }
  if (!items.length) return null;
  return { type: "task_suggestions", items };
}

export function resolveAgentPresentation(
  presentation: unknown,
  tasks: TaskRow[],
  now = new Date(),
  surface: string | null = null,
): ClientPresentation | null {
  const type =
    presentation &&
    typeof presentation === "object" &&
    !Array.isArray(presentation)
      ? (presentation as { type?: unknown }).type
      : null;
  if (type === "schedule_plan") {
    return resolveSchedulePlanPresentation(presentation, tasks, now);
  }
  if (type === "task_suggestions") {
    return resolveSuggestionPresentation(presentation);
  }
  return resolveTaskListPresentation(presentation, tasks, {
    max: surface === "forgotten" ? 6 : 20,
    openOnly: surface === "forgotten",
  });
}

export function forgottenFallback(count: number) {
  if (count <= 0) return "כרגע אין משהו שנראה דחוף או שקל לפספס.";
  if (count === 1) return "יש כרגע דבר אחד שכדאי לשים עליו עין.";
  return `יש כרגע ${count} דברים שכדאי לשים עליהם עין.`;
}

export function sanitizeCardReply(
  reply: string,
  titles: string[],
  fallback: string,
) {
  const loweredTitles = titles
    .map((title) => title.trim().toLowerCase())
    .filter(Boolean);
  const kept = reply
    .replace(/\*\*/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (/^[-*•]\s+/.test(line)) return false;
      if (/^\d+[.)]\s+/.test(line)) return false;
      if (/^#{1,6}\s+/.test(line)) return false;
      if (/^\d{1,2}:\d{2}/.test(line)) return false;
      const lower = line.toLowerCase();
      return !loweredTitles.some((title) => lower.includes(title));
    })
    .join(" ");
  const sentences = kept
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);
  return sentences.join(" ").trim() || fallback;
}

export function replyForPresentation(
  reply: string,
  presentation: ClientPresentation | null,
) {
  if (!presentation) return reply.trim();
  if (presentation.type === "task_list") {
    return sanitizeCardReply(
      reply,
      presentation.tasks.map((task) => task.title),
      forgottenFallback(presentation.tasks.length),
    );
  }
  if (presentation.type === "schedule_plan") {
    return sanitizeCardReply(
      reply,
      presentation.items.map((item) => item.title),
      "תוכנית מוצעת.",
    );
  }
  if (presentation.type === "task_suggestions") {
    return sanitizeCardReply(
      reply,
      presentation.items.map((item) => item.title),
      "הנה כמה הצעות.",
    );
  }
  return reply.trim();
}
