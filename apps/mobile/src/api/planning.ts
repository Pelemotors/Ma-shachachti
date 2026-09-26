import { productNowMs } from "../product/productClock";
import { apiRequest } from "./client";

export type MobilePlanItem = {
  id?: string;
  task_id: string;
  start_at: string;
  end_at?: string | null;
  kind: string;
  source?: string;
  routine_id?: string | null;
  occurrence_key?: string | null;
};

export function sortByDeadline<T extends { due_on?: string | null; due_at?: string | null }>(rows: T[]) {
  return [...rows].sort((left, right) => (left.due_on ?? left.due_at ?? "").localeCompare(right.due_on ?? right.due_at ?? ""));
}

export type MobileDayPlan = {
  plan: { id: string; plan_date: string; updated_at?: string } | null;
  items: MobilePlanItem[];
  constraints: Array<{ title: string; start_at: string; end_at: string }>;
  conflicts: Array<{ title: string }>;
};

export type ReplanOptions = {
  windowStart?: string;
  windowEnd?: string;
  planningContext?: string;
  taskIds?: string[];
  planUpdatedAt?: string | null;
};

export function jerusalemDateFromNow(days = 0) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(productNowMs()));
  if (!days) return today;
  const [year, month, day] = today.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function selectOpenTaskIdsForDate(
  tasks: Array<{ id: string; status: string; due_on?: string | null }>,
  date: string,
  alreadyOnPlan: string[] = [],
) {
  const dueThatDay = tasks
    .filter((task) => task.status === "open" && task.due_on === date)
    .map((task) => task.id);
  return [...new Set([...alreadyOnPlan, ...dueThatDay])];
}

export function todayJerusalemDate() {
  return jerusalemDateFromNow(0);
}

export async function getDayPlan(date: string) {
  return apiRequest<MobileDayPlan>(`/api/day-plan?date=${date}`);
}

export async function replanDay(date: string, input: ReplanOptions | string[] = {}) {
  const options: ReplanOptions = Array.isArray(input) ? { taskIds: input } : input;
  return apiRequest<MobileDayPlan>("/api/day-plan", {
    method: "POST",
    body: JSON.stringify({
      action: "replan",
      date,
      task_ids: options.taskIds ?? [],
      window_start: options.windowStart,
      window_end: options.windowEnd,
      planning_context: options.planningContext,
      plan_updated_at: options.planUpdatedAt,
    }),
  });
}

export function formatPlanTime(iso: string) {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Presentation-only. Storage and API stay YYYY-MM-DD. */
export function formatDisplayDate(ymd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Jerusalem",
  }).format(new Date(`${ymd}T12:00:00+03:00`));
}
