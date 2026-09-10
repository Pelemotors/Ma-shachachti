export const TIME_ZONE = "Asia/Jerusalem";
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function partValue(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
) {
  return parts.find((part) => part.type === type)?.value ?? "";
}

function padClock(value: string) {
  return value.padStart(2, "0");
}

function zonedParts(instant: Date, timeZone = TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  return {
    year: partValue(parts, "year"),
    month: partValue(parts, "month"),
    day: partValue(parts, "day"),
    hour: padClock(partValue(parts, "hour")),
    minute: padClock(partValue(parts, "minute")),
    second: padClock(partValue(parts, "second")),
  };
}

function offsetMs(instant: Date, timeZone = TIME_ZONE) {
  const parts = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant.getTime();
}

export function jerusalemParts(instant: Date | string) {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  const parts = zonedParts(date);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

export function todayContext(now = new Date()) {
  const parts = jerusalemParts(now);
  const weekday = new Intl.DateTimeFormat("he-IL", {
    timeZone: TIME_ZONE,
    weekday: "long",
  }).format(now);
  return {
    date: parts.date,
    weekday,
    timeZone: TIME_ZONE,
    currentTime: parts.time,
    localDateTime: `${parts.date}T${parts.time}`,
  };
}

export function jerusalemDateTimeToUtc(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  let instant = utcGuess - offsetMs(new Date(utcGuess));
  const adjusted = utcGuess - offsetMs(new Date(instant));
  if (adjusted !== instant) instant = adjusted;
  return new Date(instant);
}

export function dueOnFromDueAt(dueAt: string) {
  return jerusalemParts(dueAt).date;
}

export function dueTimeFromDueAt(dueAt: string | null | undefined) {
  if (!dueAt) return null;
  return jerusalemParts(dueAt).time;
}

export type TaskDeadline =
  | { ok: true; due_on: null; due_at: null; due_time: null }
  | { ok: true; due_on: string; due_at: null; due_time: null }
  | { ok: true; due_on: string; due_at: string; due_time: string }
  | { ok: false; error: string };

export function resolveTaskDeadline(
  due_on: string | null | undefined,
  due_time: string | null | undefined,
): TaskDeadline {
  const date = due_on?.trim() || null;
  const time = due_time?.trim() || null;
  if (!date && !time) {
    return { ok: true, due_on: null, due_at: null, due_time: null };
  }
  if (!date && time) {
    return { ok: false, error: "אי אפשר לשמור שעה בלי תאריך." };
  }
  if (!date || !DATE_RE.test(date)) {
    return { ok: false, error: "אפשר לשמור תאריך של יום בלבד, בפורמט YYYY-MM-DD." };
  }
  if (!time) {
    return { ok: true, due_on: date, due_at: null, due_time: null };
  }
  if (!TIME_RE.test(time)) {
    return { ok: false, error: "השעה צריכה להיות בפורמט HH:mm." };
  }
  const utc = jerusalemDateTimeToUtc(date, time);
  const local = jerusalemParts(utc);
  if (local.date !== date || local.time !== time) {
    return { ok: false, error: "השעה אינה קיימת ביום הזה לפי שעון ישראל." };
  }
  return {
    ok: true,
    due_on: date,
    due_at: utc.toISOString(),
    due_time: time,
  };
}

export function formatJerusalemDay(dueOn: string, month: "short" | "long" = "short") {
  const instant = jerusalemDateTimeToUtc(dueOn, "12:00");
  return new Intl.DateTimeFormat("he-IL", {
    weekday: month === "short" ? "short" : undefined,
    day: "numeric",
    month,
    timeZone: TIME_ZONE,
  }).format(instant);
}

export function formatTaskWhen(input: {
  due_on: string | null;
  due_at: string | null;
}) {
  const time = dueTimeFromDueAt(input.due_at);
  if (input.due_at && input.due_on) {
    return `${formatJerusalemDay(input.due_on, "long")} · ${time}`;
  }
  if (input.due_on) return formatJerusalemDay(input.due_on, "long");
  return "";
}
