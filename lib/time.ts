export function dayKey(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Parse ISO stamp to epoch ms; NaN if missing/invalid. */
export function stampMs(iso: string | null | undefined): number {
  if (!iso) return Number.NaN;
  return Date.parse(iso);
}

export function msUntil(iso: string, now: Date = new Date()): number {
  return stampMs(iso) - now.getTime();
}

export function isStampPast(
  iso: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const ms = stampMs(iso);
  return Number.isFinite(ms) && ms < now.getTime();
}

/** True when hiddenUntil is set and still in the future. */
export function isHiddenUntilFuture(
  hiddenUntil: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const ms = stampMs(hiddenUntil);
  return Number.isFinite(ms) && ms > now.getTime();
}
export function nextDayStart(now: Date, timezone: string) {
  const key = dayKey(now, timezone);
  let t = now.getTime();
  while (dayKey(new Date(t), timezone) === key) t += 60000;
  return new Date(Math.floor(t / 60000) * 60000).toISOString();
}
export function formatTime(value: string, timezone = "Asia/Jerusalem") {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: timezone,
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
export function shiftDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/** First instant whose calendar date in `timezone` equals `dateKey`. */
export function startOfDateKey(dateKey: string, timezone: string) {
  let t = Date.parse(`${dateKey}T12:00:00.000Z`);
  while (dayKey(new Date(t), timezone) > dateKey) t -= 60 * 60000;
  while (dayKey(new Date(t), timezone) < dateKey) t += 60 * 60000;
  while (dayKey(new Date(t), timezone) === dateKey) t -= 60000;
  return new Date(t + 60000).toISOString();
}

export function isoAtLocal(
  dateKey: string,
  hour: number,
  minute: number,
  timezone: string,
) {
  const start = Date.parse(startOfDateKey(dateKey, timezone));
  return new Date(start + hour * 3600000 + minute * 60000).toISOString();
}

export function clockForDateKey(
  dateKey: string,
  timezone: string,
  now: Date = new Date(),
) {
  if (dayKey(now, timezone) === dateKey) return now;
  return new Date(isoAtLocal(dateKey, 9, 0, timezone));
}

export function formatClockTime(value: string, timezone = "Asia/Jerusalem") {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

export function localHour(value: string, timezone: string) {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date(value)),
  );
}

export function addCalendarDays(iso: string, days: number, timezone: string) {
  const start = new Date(iso);
  const target = new Date(start.getTime() + days * 86400000);
  const hour = (d: Date) =>
    Number(
      new Intl.DateTimeFormat("en", {
        timeZone: timezone,
        hour: "numeric",
        hourCycle: "h23",
      }).format(d),
    );
  let diff = hour(start) - hour(target);
  if (diff > 12) diff -= 24;
  if (diff < -12) diff += 24;
  return new Date(target.getTime() + diff * 3600000).toISOString();
}

export { resolveRelativeTime } from "./relative-time";
