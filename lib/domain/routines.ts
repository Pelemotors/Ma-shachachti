import type { AppState, Routine } from "@/lib/model";
import { dayKey } from "@/lib/time";

function dateParts(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return { year, month, day };
}

function calendarDayDiff(a: string, b: string) {
  const aa = dateParts(a);
  const bb = dateParts(b);
  return Math.floor(
    (Date.UTC(bb.year, bb.month - 1, bb.day) -
      Date.UTC(aa.year, aa.month - 1, aa.day)) /
      86400000,
  );
}

function localWeekday(now: Date, timezone: string) {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).format(now);
  return (
    {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    }[short] ?? now.getUTCDay()
  );
}

function monthsBetween(a: string, b: string) {
  const aa = dateParts(a);
  const bb = dateParts(b);
  return (bb.year - aa.year) * 12 + (bb.month - aa.month);
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Deterministic schedule evaluation; never decides whether something is a routine. */
export function isRoutineDueToday(
  routine: Routine,
  now: Date,
  timezone: string,
) {
  if (routine.status !== "active") return false;
  const today = dayKey(now, timezone);
  const anchor = dayKey(new Date(routine.createdAt), timezone);
  const diff = calendarDayDiff(anchor, today);
  if (diff < 0) return false;

  switch (routine.schedule.frequency) {
    case "daily":
      return diff % routine.schedule.interval === 0;
    case "interval_days":
      return diff % routine.schedule.everyDays === 0;
    case "weekly": {
      const weeks = Math.floor(diff / 7);
      return (
        weeks % routine.schedule.interval === 0 &&
        routine.schedule.weekdays.includes(localWeekday(now, timezone))
      );
    }
    case "monthly": {
      const months = monthsBetween(anchor, today);
      if (months < 0 || months % routine.schedule.interval !== 0) return false;
      const p = dateParts(today);
      const targetDay = Math.min(
        routine.schedule.dayOfMonth,
        daysInMonth(p.year, p.month),
      );
      return p.day === targetDay;
    }
  }
}

/** Convert a local wall-clock time to an ISO stamp without hardcoding UTC offset. */
export function localWallTimeToIso(
  date: string,
  time: string,
  timezone: string,
) {
  const desired = Date.parse(`${date}T${time}:00Z`);
  let guess = desired;
  for (let pass = 0; pass < 2; pass++) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? "00";
    const actualLocalAsUtc = Date.parse(
      `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}:00Z`,
    );
    guess += desired - actualLocalAsUtc;
  }
  return new Date(guess).toISOString();
}

function routineWindow(routine: Routine, date: string, timezone: string) {
  if (routine.atTime) {
    return {
      dueAt: localWallTimeToIso(date, routine.atTime, timezone),
      preferredWindow: null,
    };
  }
  const hours =
    routine.timeOfDay === "morning"
      ? ["06:00", "12:00"]
      : routine.timeOfDay === "afternoon"
        ? ["12:00", "17:00"]
        : routine.timeOfDay === "evening"
          ? ["17:00", "22:00"]
          : null;
  if (!hours) return { dueAt: null, preferredWindow: null };
  return {
    dueAt: null,
    preferredWindow: {
      start: localWallTimeToIso(date, hours[0], timezone),
      end: localWallTimeToIso(date, hours[1], timezone),
    },
  };
}

/**
 * Materialize at most one task occurrence for each due routine/day. Mutates the
 * cloned state owned by Domain. Existing completed history is never deleted.
 */
export function materializeDueRoutinesInPlace(
  state: AppState,
  now: Date = new Date(),
) {
  const timezone = state.profile.timezone;
  const today = dayKey(now, timezone);
  const stamp = now.toISOString();
  const activeFactIds = new Set(
    state.facts
      .filter((f) => !f.expiresAt || Date.parse(f.expiresAt) > now.getTime())
      .map((f) => f.id),
  );
  let created = 0;

  for (const routine of state.routines) {
    if (routine.sourceFactId && !activeFactIds.has(routine.sourceFactId)) {
      if (routine.status === "active") {
        routine.status = "paused";
        routine.updatedAt = stamp;
      }
      continue;
    }
    if (!isRoutineDueToday(routine, now, timezone)) continue;
    if (routine.lastMaterializedDate === today) continue;

    const already = state.tasks.some(
      (t) =>
        t.routineId === routine.id &&
        dayKey(new Date(t.createdAt), timezone) === today,
    );
    if (!already) {
      const timing = routineWindow(routine, today, timezone);
      state.tasks.push({
        id: crypto.randomUUID(),
        title: routine.title,
        categoryId: routine.categoryId,
        detailTypeId: routine.detailTypeId,
        classification: {
          source: "agent",
          confidence: "high",
          userOverride: false,
        },
        enrichmentStatus: "done",
        kind: "task",
        status: "open",
        createdAt: stamp,
        updatedAt: stamp,
        dueAt: timing.dueAt,
        preferredWindow: timing.preferredWindow,
        hiddenUntil: null,
        startedAt: null,
        workMinutes: routine.workMinutes,
        waitMinutes: 0,
        effort: routine.effort,
        priority: routine.priority,
        dependsOn: [],
        steps: [],
        templateId: null,
        recurrenceDays: null,
        occurrenceOf: null,
        routineId: routine.id,
        notes: routine.notes,
        completedAt: null,
        actualWorkMinutes: null,
        durationFeedbackAskedAt:
          state.tasks.find(
            (t) => t.routineId === routine.id && t.durationFeedbackAskedAt,
          )?.durationFeedbackAskedAt ?? null,
        relatedMemberIds: routine.relatedMemberIds,
        homeAreaIds: routine.homeAreaIds,
      });
      created++;
    }
    routine.lastMaterializedDate = today;
    routine.updatedAt = stamp;
  }

  return created;
}
