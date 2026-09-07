/**
 * Resolve Hebrew relative time phrases into ISO timestamps using profile timezone.
 */
export function resolveRelativeTime(
  phrase: string,
  now: Date,
  timeZone: string,
): {
  dueAt?: string;
  preferredWindow?: { start?: string; end?: string };
  hiddenUntil?: string;
} | null {
  const text = phrase.trim();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  const y = Number(get("year"));
  const m = Number(get("month"));
  const d = Number(get("day"));

  const atLocal = (
    yy: number,
    mm: number,
    dd: number,
    hh: number,
    mi: number,
  ) => {
    // Construct as wall-clock in Asia/Jerusalem-like zones via Date parsing of offset-less local then adjust is imperfect;
    // use temporal approximation: format a UTC guess then rely on ISO with offset from Intl.
    const probe = new Date(Date.UTC(yy, mm - 1, dd, hh - 3, mi)); // IL standard approx; refined below
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    void fmt;
    // Prefer explicit offset from formatter
    const offsetPart = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
    })
      .formatToParts(probe)
      .find((p) => p.type === "timeZoneName")?.value;
    const match = offsetPart?.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/);
    const oh = match ? Number(match[1]) : 3;
    const om = match && match[2] ? Number(match[2]) : 0;
    const utc = Date.UTC(yy, mm - 1, dd, hh - oh, mi - om);
    return new Date(utc)
      .toISOString()
      .replace(
        /\.\d{3}Z$/,
        `${oh >= 0 ? "+" : "-"}${String(Math.abs(oh)).padStart(2, "0")}:${String(om).padStart(2, "0")}`,
      );
  };

  if (/היום בערב|הערב/.test(text)) {
    const start = atLocal(y, m, d, 18, 0);
    const end = atLocal(y, m, d, 22, 0);
    return { preferredWindow: { start, end } };
  }
  if (/אחרי\s*18/.test(text)) {
    return { preferredWindow: { start: atLocal(y, m, d, 18, 0) } };
  }
  if (/מחר בבוקר/.test(text)) {
    const start = atLocal(y, m, d + 1, 8, 0);
    const end = atLocal(y, m, d + 1, 12, 0);
    return { preferredWindow: { start, end } };
  }
  if (/מחר/.test(text)) {
    return { dueAt: atLocal(y, m, d + 1, 20, 0) };
  }
  if (/שבוע הבא/.test(text)) {
    return { dueAt: atLocal(y, m, d + 7, 12, 0) };
  }
  if (/עד שישי|בסוף השבוע/.test(text)) {
    // naive: + days until Friday (5)
    const weekday = Number(
      new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" })
        .formatToParts(now)
        .find((p) => p.type === "weekday")
        ? 0
        : 0,
    );
    void weekday;
    const jsDay = now.getDay();
    const add = (5 - jsDay + 7) % 7 || 7;
    return { dueAt: atLocal(y, m, d + add, 18, 0) };
  }
  return null;
}
