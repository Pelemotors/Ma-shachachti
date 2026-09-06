export function dayKey(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
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
