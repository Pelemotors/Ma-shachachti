import type { AppState, Task } from "../../model";
import type { CategoryId } from "../../taxonomy";
import { isStampPast, msUntil } from "../../time";

export type LifeAdminWindow = AppState["compactedMemory"]["lifeAdminWindow"];

export type LifeAdminConfirmResponse = "yes" | "earlier" | "later" | "varies";

export type LifeAdminDigest = {
  summary: string;
  taskIds: string[];
};

/** Ask while samples are still low — do not lock preference from one event. */
export const LIFE_ADMIN_ASK_UNTIL_SAMPLES = 3;

const LEARN_RATE = 0.35;
const WINDOW_MINUTES = 90;
const SHIFT_MINUTES = 60;

const LIFE_ADMIN: CategoryId[] = [
  "health_appointments",
  "documents_admin",
  "finances_bills",
  "errands",
  "children_school",
  "travel_outings",
  "work_study",
  "guests_hosting",
];

/** Category-first. Title heuristics are fallback only for legacy unclassified tasks. */
const LIFE_FALLBACK_RE =
  /ביטוח|תשלום|מסמך|תור|ברכה|מתנה|אירוע|הבטחה|טלפון|דואר|טופס|חשבון|מרשם/;

export function isLifeAdminTask(task: Task): boolean {
  if (LIFE_ADMIN.includes(task.categoryId)) return true;
  if (task.categoryId !== "unclassified") return false;
  return LIFE_FALLBACK_RE.test(task.title);
}

function asWindow(
  personalization:
    AppState["compactedMemory"] | LifeAdminWindow | null | undefined,
): LifeAdminWindow {
  if (!personalization) {
    return {
      preferredStartMinutes: null,
      preferredEndMinutes: null,
      confidence: 0,
      samples: 0,
    };
  }
  if ("lifeAdminWindow" in personalization) {
    return personalization.lifeAdminWindow;
  }
  return personalization;
}

export function minutesOfDay(now: Date, timezone = "Asia/Jerusalem"): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function clampMinutes(n: number): number {
  return Math.max(0, Math.min(24 * 60, Math.round(n)));
}

function confidenceFromSamples(samples: number): number {
  // Gradual: single sample stays weak; ~5 samples approach high.
  return Math.min(1, samples / 5);
}

/**
 * Update the preferred life/admin window gradually from a completion time.
 * Never treats a single event as a locked preference.
 */
export function recordLifeAdminCompletion(
  personalization:
    AppState["compactedMemory"] | LifeAdminWindow | null | undefined,
  completedAtMinutes: number,
): LifeAdminWindow {
  const prev = asWindow(personalization);
  const observed = clampMinutes(completedAtMinutes);
  const samples = prev.samples + 1;

  let start: number;
  if (prev.preferredStartMinutes == null) {
    start = observed;
  } else {
    start = clampMinutes(
      prev.preferredStartMinutes * (1 - LEARN_RATE) + observed * LEARN_RATE,
    );
  }

  return {
    preferredStartMinutes: start,
    preferredEndMinutes: clampMinutes(start + WINDOW_MINUTES),
    confidence: confidenceFromSamples(samples),
    samples,
  };
}

export function applyLifeAdminConfirm(
  personalization:
    AppState["compactedMemory"] | LifeAdminWindow | null | undefined,
  completedAtMinutes: number,
  response: LifeAdminConfirmResponse,
): LifeAdminWindow {
  let next = recordLifeAdminCompletion(personalization, completedAtMinutes);
  const start = next.preferredStartMinutes ?? clampMinutes(completedAtMinutes);

  if (response === "earlier") {
    const shifted = clampMinutes(start - SHIFT_MINUTES);
    next = {
      ...next,
      preferredStartMinutes: shifted,
      preferredEndMinutes: clampMinutes(shifted + WINDOW_MINUTES),
    };
  } else if (response === "later") {
    const shifted = clampMinutes(start + SHIFT_MINUTES);
    next = {
      ...next,
      preferredStartMinutes: shifted,
      preferredEndMinutes: clampMinutes(shifted + WINDOW_MINUTES),
    };
  } else if (response === "varies") {
    next = {
      ...next,
      confidence: Math.min(next.confidence, 0.25),
    };
  } else {
    next = {
      ...next,
      confidence: Math.min(1, next.confidence + 0.1),
    };
  }

  return next;
}

export function shouldAskLifeAdminWindowConfirm(
  personalization:
    AppState["compactedMemory"] | LifeAdminWindow | null | undefined,
): boolean {
  return asWindow(personalization).samples < LIFE_ADMIN_ASK_UNTIL_SAMPLES;
}

/** Aligns with notification policy urgent push candidates. */
function alreadyUrgentPush(task: Task, now: Date): boolean {
  if (task.priority >= 3) return true;
  if (task.dueAt && isStampPast(task.dueAt, now)) return true;
  return false;
}

function digestRank(task: Task, now: Date): number {
  let n = 0;
  if (task.dueAt) {
    const hours = msUntil(task.dueAt, now) / 3600000;
    if (hours < 0) n += 3000 + Math.min(500, -hours * 10);
    else if (hours <= 24) n += 2000 - hours * 10;
    else if (hours <= 72) n += 1000 - hours;
    else n += 200;
  }
  if (task.priority >= 3) n += 800;
  else if (task.priority >= 2) n += 400;
  else n += task.priority * 50;
  return n;
}

function hebrewJoin(titles: string[]): string {
  if (titles.length === 0) return "";
  if (titles.length === 1) return titles[0]!;
  if (titles.length === 2) return `${titles[0]} ו${titles[1]}`;
  return `${titles.slice(0, -1).join(", ")} ו${titles[titles.length - 1]}`;
}

/**
 * Medium life/admin digest. Excludes tasks that already warrant (or got) an urgent push.
 */
export function buildLifeAdminDigest(
  tasks: Task[],
  personalization: AppState["compactedMemory"] | null | undefined,
  now: Date,
  opts?: { excludeTaskIds?: Iterable<string> },
): LifeAdminDigest {
  void personalization;
  const excluded = new Set(opts?.excludeTaskIds ?? []);

  const candidates = tasks
    .filter((t) => isLifeAdminTask(t))
    .filter((t) => t.kind === "task")
    .filter(
      (t) =>
        t.status === "open" ||
        t.status === "unknown" ||
        t.status === "in_progress",
    )
    .filter((t) => !excluded.has(t.id))
    .filter((t) => !alreadyUrgentPush(t, now))
    .sort((a, b) => digestRank(b, now) - digestRank(a, now))
    .slice(0, 5);

  if (candidates.length === 0) {
    return { summary: "", taskIds: [] };
  }

  const titles = candidates.map((t) => t.title);
  const summary =
    candidates.length === 1
      ? `יש לך עכשיו דבר קטן שאפשר לסגור: ${titles[0]}.`
      : `יש לך עכשיו כמה דברים קטנים שאפשר לסגור: ${hebrewJoin(titles)}.`;

  return {
    summary,
    taskIds: candidates.map((t) => t.id),
  };
}
