import { addJerusalemDays, todayContext } from "./time.ts";

export type DayPlanQueryItem = {
  task_id: string;
  start_at: string;
  end_at?: string | null;
  kind?: string;
  source?: string;
};

export type DayPlanQueryTask = {
  id: string;
  title: string;
  status: "open" | "done" | "cancelled" | string;
};

/** Resolve a Jerusalem calendar date mentioned in a Hebrew user turn. */
export function resolveMentionedJerusalemDate(
  text: string,
  now = new Date(),
): string | null {
  const today = todayContext(now).date;
  if (/מחר/.test(text)) return addJerusalemDays(today, 1);
  if (/אתמול/.test(text)) return addJerusalemDays(today, -1);
  if (/היום/.test(text)) return today;
  return null;
}

export function isMoreOfSameDayFollowup(text: string) {
  return /מה עוד|עוד אני יכול|עוד אפשר/.test(text);
}

export function taskIdsFromPresentation(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const row = value as { type?: string; task_ids?: unknown; items?: unknown };
  if (Array.isArray(row.task_ids)) {
    return row.task_ids.filter((id): id is string => typeof id === "string");
  }
  if (Array.isArray(row.items)) {
    return row.items.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const id = (item as { task_id?: unknown }).task_id;
      return typeof id === "string" ? [id] : [];
    });
  }
  return [];
}

/**
 * day_plan is the only schedule SoT for a asked date.
 * Completed/cancelled items never surface. Follow-up turns drop already shown ids.
 */
export function filterDayPlanForQuery(input: {
  targetDate: string;
  todayDate: string;
  items: DayPlanQueryItem[];
  tasks: DayPlanQueryTask[];
  alreadyShownTaskIds?: Iterable<string>;
  excludeAlreadyShown?: boolean;
}) {
  if (input.targetDate === input.todayDate && /מחר/.test("")) {
    /* no-op — date comparison is the caller contract */
  }
  const byId = new Map(input.tasks.map((task) => [task.id, task]));
  const shown = new Set(input.alreadyShownTaskIds ?? []);
  return input.items.filter((item) => {
    const task = byId.get(item.task_id);
    if (!task) return false;
    if (task.status !== "open") return false;
    if (input.excludeAlreadyShown && shown.has(item.task_id)) return false;
    return true;
  });
}
