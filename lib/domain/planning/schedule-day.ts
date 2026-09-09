import type {
  AppState,
  DailyPlanItem,
  DailyPlanSession,
  Task,
} from "@/lib/model";
import { formatClockTime, localHour } from "@/lib/time";

export type DayPart = "morning" | "afternoon" | "evening" | "unscheduled";

export const DAY_PART_LABELS: Record<DayPart, string> = {
  morning: "בוקר",
  afternoon: "צהריים",
  evening: "ערב",
  unscheduled: "במהלך היום",
};

export const DAY_PART_ANCHORS: Record<
  Exclude<DayPart, "unscheduled">,
  { hour: number; minute: number }
> = {
  morning: { hour: 8, minute: 30 },
  afternoon: { hour: 13, minute: 0 },
  evening: { hour: 18, minute: 0 },
};

/** Read the stored DailyPlan when it belongs to the requested calendar day. */
export function planForDate(
  state: AppState,
  dateKey: string,
): DailyPlanSession | null {
  const plan = state.planning.plan;
  if (!plan || plan.date !== dateKey) return null;
  return plan;
}

export function visiblePlanItems(plan: DailyPlanSession): DailyPlanItem[] {
  return [...plan.items]
    .filter((item) => item.planStatus !== "skipped")
    .sort((a, b) => a.order - b.order);
}

export function dayPartFromStamp(
  iso: string | null | undefined,
  timezone: string,
): DayPart {
  if (!iso) return "unscheduled";
  const hour = localHour(iso, timezone);
  if (!Number.isFinite(hour)) return "unscheduled";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export function formatShortDate(dateKey: string) {
  const [, month, day] = dateKey.split("-");
  return `${Number(day)}.${Number(month)}`;
}

export function itemClockLabel(
  item: DailyPlanItem,
  timezone: string,
): string | null {
  if (!item.plannedStart) return null;
  return formatClockTime(item.plannedStart, timezone);
}

export function itemTimeInputValue(
  item: DailyPlanItem,
  timezone: string,
): string {
  if (!item.plannedStart) return "";
  const hour = String(localHour(item.plannedStart, timezone)).padStart(2, "0");
  const minute = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    minute: "2-digit",
  }).format(new Date(item.plannedStart));
  return `${hour}:${minute.padStart(2, "0")}`;
}

export type ScheduleRow = {
  item: DailyPlanItem;
  task: Task;
  timeLabel: string | null;
  timeInput: string;
  part: DayPart;
};

export function scheduleRowsForPlan(
  state: AppState,
  plan: DailyPlanSession,
  timezone: string,
): ScheduleRow[] {
  const byId = new Map(state.tasks.map((task) => [task.id, task]));
  return visiblePlanItems(plan)
    .map((item) => {
      const task = byId.get(item.taskId);
      if (!task || task.status === "cancelled") return null;
      const stamp =
        item.plannedStart ?? task.preferredWindow?.start ?? task.dueAt;
      return {
        item,
        task,
        timeLabel: itemClockLabel(item, timezone),
        timeInput: itemTimeInputValue(item, timezone),
        part: dayPartFromStamp(stamp, timezone),
      };
    })
    .filter((row): row is ScheduleRow => Boolean(row));
}

export function groupScheduleRows(rows: ScheduleRow[]): {
  part: DayPart;
  items: ScheduleRow[];
}[] {
  const buckets: Record<DayPart, ScheduleRow[]> = {
    morning: [],
    afternoon: [],
    evening: [],
    unscheduled: [],
  };
  for (const row of rows) buckets[row.part].push(row);
  return (Object.keys(buckets) as DayPart[])
    .filter((part) => buckets[part].length)
    .map((part) => ({ part, items: buckets[part] }));
}
