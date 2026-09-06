import { AppState, normalize } from "./model";
export function consumptionInsights(s: AppState, now = new Date()) {
  const groups = new Map<string, { title: string; dates: number[] }>();
  for (const i of s.shopping) {
    if (!i.purchasedAt) continue;
    const key = normalize(i.title);
    const g = groups.get(key) ?? { title: i.title, dates: [] };
    g.dates.push(Date.parse(i.purchasedAt));
    groups.set(key, g);
  }
  return [...groups.values()]
    .filter((g) => g.dates.length >= 4)
    .flatMap((g) => {
      const dates = [...new Set(g.dates)].sort((a, b) => a - b);
      const gaps = dates.slice(1).map((d, i) => (d - dates[i]) / 86400000);
      if (gaps.length < 3) return [];
      const sorted = [...gaps].sort((a, b) => a - b),
        days = sorted[Math.floor(sorted.length / 2)];
      if (
        days < 2 ||
        gaps.filter((x) => Math.abs(x - days) < days * 0.35).length < 3
      )
        return [];
      const next = new Date(dates.at(-1)! + days * 86400000);
      return [
        {
          title: g.title,
          days: Math.round(days),
          expected: next.toISOString(),
          checkSoon: next.getTime() - now.getTime() < 5 * 86400000,
          samples: dates.length,
        },
      ];
    });
}
// Calendar cues are suggestions only, never commitments or claims about the family's actual needs.
export function calendarSuggestions(s: AppState, now = new Date()) {
  const month = Number(
    new Intl.DateTimeFormat("en", {
      timeZone: s.profile.timezone,
      month: "numeric",
    }).format(now),
  );
  const result: string[] = [];
  if (s.profile.children > 0) {
    if ([8, 9].includes(month))
      result.push("לבדוק ציוד והודעות לקראת תחילת המסגרת");
    if ([3, 4, 10, 11].includes(month))
      result.push("לבדוק אילו בגדים עדיין מתאימים במידה ולעונה");
  }
  return result;
}
