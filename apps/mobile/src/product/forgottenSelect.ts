import type { ForgottenItem, ForgottenSection, ForgottenIcon } from "../api/forgot";
import type { MobileTask } from "../api/tasks";
import { productNow } from "./productClock";

function iconFor(title: string): ForgottenIcon {
  if (/קנ|חלב|מצרכ|סופר|טיטול/.test(title)) return "cart";
  if (/רופא|תור|קלינ|בריאות/.test(title)) return "doctor";
  if (/התקשר|טלפ|סבתא|אבא|אמא/.test(title)) return "phone";
  if (/יום הולדת|מסיב|עוגה/.test(title)) return "cake";
  if (/טיס|מטוס|אילת/.test(title)) return "airplane";
  if (/בגד|חורף|חולצ|כביס/.test(title)) return "shirt";
  return "document";
}

function todayJerusalem() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(productNow());
}

function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + days, 12));
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(next);
}

export function forgottenFromTasks(tasks: MobileTask[]): ForgottenSection[] {
  const today = todayJerusalem();
  const weekEnd = addDays(today, 6);
  const seen = new Set<string>();
  const open = tasks.filter((task) => {
    if (task.status !== "open") return false;
    const title = task.title.trim();
    if (!title || seen.has(title)) return false;
    seen.add(title);
    return true;
  });
  const due = (task: MobileTask) => task.due_on ?? (task.due_at ? task.due_at.slice(0, 10) : null);
  const rank = (task: MobileTask) => {
    const on = due(task);
    if (on && on < today) return 0;
    if (on === today) return 1;
    if (on && on <= weekEnd) return 2;
    if (!on) return 3;
    return 4;
  };
  const picked = [...open].sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title, "he")).slice(0, 6);
  const toItem = (task: MobileTask): ForgottenItem => {
    const on = due(task);
    const bucket = !on ? "later" : on <= today ? "today" : on <= weekEnd ? "week" : "later";
    return { id: task.id, title: task.title.trim(), subtitle: null, bucket, icon: iconFor(task.title) };
  };
  const items = picked.map(toItem);
  return (
    [
      { id: "today", title: "היום" },
      { id: "week", title: "השבוע" },
      { id: "later", title: "בהמשך" },
    ] as const
  ).map((section) => ({
    ...section,
    items: items.filter((item) => item.bucket === section.id),
  }));
}
