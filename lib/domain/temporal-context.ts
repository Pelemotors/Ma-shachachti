import type { AppState } from "@/lib/model";
import { dayKey } from "@/lib/time";

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function weekdayInZone(date: Date, timezone: string) {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
  })
    .format(date)
    .toLowerCase();
  return (WEEKDAYS.find((day) => name.startsWith(day.slice(0, 3))) ??
    "sunday") as (typeof WEEKDAYS)[number];
}

function relation(selected: string, today: string) {
  if (selected === today) return "today" as const;
  return selected < today ? ("past" as const) : ("future" as const);
}

export function buildTemporalContext(
  state: AppState,
  input: { now?: Date; selectedDate?: string | null } = {},
) {
  const now = input.now ?? new Date();
  const timezone = state.profile.timezone;
  const localDateKey = dayKey(now, timezone);
  const selectedDateKey = input.selectedDate ?? localDateKey;
  const wm = state.agentWorkingMemory;
  const workingMemoryUpdatedAt = wm?.updatedAt ?? null;
  const workingMemoryDateKey = workingMemoryUpdatedAt
    ? dayKey(new Date(workingMemoryUpdatedAt), timezone)
    : null;
  return {
    nowUtc: now.toISOString(),
    nowLocal: new Intl.DateTimeFormat("he-IL", {
      timeZone: timezone,
      dateStyle: "short",
      timeStyle: "short",
    }).format(now),
    timezone,
    localDateKey,
    localDayOfWeek: weekdayInZone(now, timezone),
    selectedDateKey,
    selectedDateDayOfWeek: weekdayInZone(
      new Date(`${selectedDateKey}T12:00:00.000Z`),
      timezone,
    ),
    selectedDateRelation: relation(selectedDateKey, localDateKey),
    workingMemoryUpdatedAt,
    workingMemoryDateKey,
    dayChangedSinceWorkingMemoryUpdate: Boolean(
      workingMemoryDateKey && workingMemoryDateKey !== localDateKey,
    ),
  };
}
