import {
  rankTaskCandidates,
  stabilizeForgottenSelection,
} from "./agent/candidate-rank.ts";
import { productNow } from "./product-clock-server.ts";
import { addJerusalemDays, jerusalemDateTimeToUtc, todayContext } from "./time.ts";
import type { ConsequenceRow, TaskRow } from "./types.ts";

export type ForgottenBucket = "today" | "week" | "later";

export type ForgottenItem = {
  id: string;
  title: string;
  subtitle: string | null;
  bucket: ForgottenBucket;
  icon: ForgottenIcon;
};

export type ForgottenIcon =
  | "document"
  | "cart"
  | "doctor"
  | "phone"
  | "cake"
  | "airplane"
  | "shirt"
  | "sun"
  | "calendar"
  | "gift";

export type ForgottenSection = {
  id: ForgottenBucket;
  title: string;
  items: ForgottenItem[];
};

export type ForgottenSurface = {
  date: string;
  sections: ForgottenSection[];
};

const SECTION_TITLE: Record<ForgottenBucket, string> = {
  today: "היום",
  week: "השבוע",
  later: "בהמשך",
};

export function forgottenIconForTitle(title: string): ForgottenIcon {
  if (/קנ|חלב|מצרכ|סופר|טיטול/.test(title)) return "cart";
  if (/רופא|תור|קלינ|בריאות/.test(title)) return "doctor";
  if (/התקשר|טלפ|סבתא|אבא|אמא/.test(title)) return "phone";
  if (/יום הולדת|מסיב|עוגה/.test(title)) return "cake";
  if (/טיס|מטוס|אילת/.test(title)) return "airplane";
  if (/בגד|חורף|חולצ|כביס/.test(title)) return "shirt";
  if (/כביס|מסמך|טופס|תכשיט|פסטיגל/.test(title)) return "document";
  return "document";
}

export function jerusalemSaturdayOnOrAfter(today: string): string {
  let date = today;
  for (let i = 0; i < 7; i += 1) {
    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      weekday: "short",
    }).format(jerusalemDateTimeToUtc(date, "12:00"));
    if (weekday === "Sat") return date;
    date = addJerusalemDays(date, 1);
  }
  return today;
}

export function forgottenDueDate(task: Pick<TaskRow, "due_on" | "due_at" | "planned_start_at">) {
  if (task.due_on) return task.due_on;
  if (task.due_at) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(task.due_at));
  }
  if (task.planned_start_at) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(task.planned_start_at));
  }
  return null;
}

export function bucketForgottenDate(
  dueOn: string | null,
  today: string,
  weekEnd: string,
): ForgottenBucket {
  if (!dueOn) return "later";
  if (dueOn <= today) return "today";
  if (dueOn <= weekEnd) return "week";
  return "later";
}

function subtitleFor(task: TaskRow): string | null {
  const notes = task.notes?.trim();
  return notes ? notes : null;
}

export function buildForgottenSurface(input: {
  tasks: TaskRow[];
  consequences?: ConsequenceRow[];
  planTaskIds?: string[];
  routineTaskIds?: string[];
  now?: Date;
}): ForgottenSurface {
  const now = input.now ?? productNow();
  const { date: today } = todayContext(now);
  const weekEnd = jerusalemSaturdayOnOrAfter(today);
  const planTaskIds = new Set(input.planTaskIds ?? []);
  const routineTaskIds = new Set(input.routineTaskIds ?? []);
  const consequenceByTask = new Map(
    (input.consequences ?? []).map((row) => [row.task_id, row]),
  );
  const open = input.tasks.filter((task) => {
    if (task.status !== "open") return false;
    if (planTaskIds.has(task.id) || routineTaskIds.has(task.id)) return false;
    const due = forgottenDueDate(task);
    const hasMissedReminder = Boolean(
      task.reminder_enabled &&
        task.reminder_at &&
        Date.parse(task.reminder_at) <= now.getTime(),
    );
    const hasConsequence = (consequenceByTask.get(task.id)?.severity ?? "none") !== "none";
    const hasAttentionSignal = (task.reschedule_count ?? 0) > 0 || hasMissedReminder || hasConsequence;
    const dueSoon = Boolean(due && due <= addJerusalemDays(today, 7));
    return Boolean(dueSoon || hasAttentionSignal);
  });
  const ranked = rankTaskCandidates({
    tasks: open,
    consequences: input.consequences,
    now,
  });
  for (const row of ranked) {
    const task = row.task;
    const due = forgottenDueDate(task);
    if (due && due > today && due <= addJerusalemDays(today, 2)) {
      row.score += 2;
      row.reasons.push("near_deadline");
    }
    if (
      task.reminder_enabled &&
      task.reminder_at &&
      Date.parse(task.reminder_at) <= now.getTime()
    ) {
      row.score += 5;
      row.reasons.push("missed_reminder");
    }
  }
  ranked.sort((a, b) => b.score - a.score || a.task.created_at.localeCompare(b.task.created_at) || a.task.id.localeCompare(b.task.id));
  const ids = stabilizeForgottenSelection({
    selectedIds: input.planTaskIds ?? [],
    ranked,
    targetMin: Math.min(6, ranked.length),
    targetMax: 6,
  });
  const byId = new Map(open.map((task) => [task.id, task]));
  const seenTitle = new Set<string>();
  const items: ForgottenItem[] = [];
  for (const id of ids) {
    const task = byId.get(id);
    if (!task) continue;
    const title = task.title.trim();
    if (!title || seenTitle.has(title)) continue;
    seenTitle.add(title);
    const due = forgottenDueDate(task);
    items.push({
      id: task.id,
      title,
      subtitle: subtitleFor(task),
      bucket: bucketForgottenDate(due, today, weekEnd),
      icon: forgottenIconForTitle(title),
    });
  }
  const sections: ForgottenSection[] = (["today", "week", "later"] as const).map((id) => ({
    id,
    title: SECTION_TITLE[id],
    items: items.filter((item) => item.bucket === id),
  }));
  return { date: today, sections };
}
