import {
  ActionBatch,
  AppState,
  Action,
  Task,
  StateSchema,
  normalize,
} from "./model";
import {
  nextDayStart,
  addCalendarDays,
  dayKey,
  isHiddenUntilFuture,
  msUntil,
} from "./time";
import { enrichTaskLocal } from "./enrichment";
import { applyLifeAdminConfirm } from "./domain/notifications/life-admin";
import { applyForecastEvent } from "./domain/forecast";
import { classifyTaskDuplicate, isHardDuplicate } from "./domain/tasks/dedupe";
import { isDuplicatePendingReminder } from "./domain/reminders/dedupe";
import {
  isLifeAdminTask,
  recordLifeAdminCompletion,
} from "./domain/notifications/life-admin";

/** Structured marker from semantic forecast_event — not NLP. */
const FORECAST_FACT_RE =
  /^forecast:(replenishment|depletion|correction):(.+)$/i;
export function requiresConfirmation(actions: Action[]) {
  return (
    actions.filter((a) => a.type !== "message.add").length > 5 ||
    actions.some(
      (a) =>
        ["history.clear", "fact.remove", "shopping.remove"].includes(a.type) ||
        (a.type === "task.status" && a.status === "cancelled") ||
        (a.type === "profile.update" &&
          (a.patch.aiConsent !== undefined || a.patch.autoApply !== undefined)),
    )
  );
}

export function applyActions(
  state: AppState,
  raw: Action[],
  now = new Date(),
  confirmed = false,
): AppState {
  const actions = ActionBatch.parse(raw);
  if (requiresConfirmation(actions) && !confirmed)
    throw new Error("נדרש אישור לפעולה הזאת.");
  const s = StateSchema.parse(structuredClone(state));
  const stamp = now.toISOString();
  const task = (id: string) => {
    const t = s.tasks.find((x) => x.id === id);
    if (!t) throw new Error("המשימה לא נמצאה.");
    return t;
  };

  for (const action of actions) {
    switch (action.type) {
      case "task.create": {
        const input = action.task;
        const match = classifyTaskDuplicate(s, {
          title: input.title,
          kind: input.kind,
          categoryId: input.categoryId,
          detailTypeId: input.detailTypeId,
          templateId: input.templateId,
          dueAt: input.dueAt,
          homeAreaIds: input.homeAreaIds,
          relatedMemberIds: input.relatedMemberIds,
        });
        if (isHardDuplicate(match)) break;
        const enriched = enrichTaskLocal({
          title: input.title.trim(),
          categoryId: input.categoryId,
          detailTypeId: input.detailTypeId,
          workMinutes: input.workMinutes,
          waitMinutes: input.waitMinutes,
          effort: input.effort,
          priority: input.priority,
          kind: input.kind,
          templateId: input.templateId,
        });
        const catalogish =
          Boolean(input.templateId) ||
          input.classification?.source === "catalog";
        let classification = input.classification ?? {
          source: (catalogish
            ? "catalog"
            : input.categoryId
              ? "user"
              : "agent") as
            "user" | "agent" | "catalog" | "migration" | "learned",
          confidence: (input.categoryId && input.categoryId !== "unclassified"
            ? "high"
            : "medium") as "high" | "medium" | "unknown",
          userOverride: false,
        };
        if (classification.source === "migration") {
          classification = {
            ...classification,
            source: catalogish ? "catalog" : "agent",
            confidence:
              classification.confidence === "unknown"
                ? "medium"
                : classification.confidence,
          };
        }
        s.tasks.push({
          id: input.id ?? crypto.randomUUID(),
          title: input.title.trim(),
          categoryId: enriched.categoryId,
          detailTypeId: enriched.detailTypeId,
          classification,
          enrichmentStatus:
            input.enrichmentStatus ??
            (input.categoryId && input.categoryId !== "unclassified"
              ? "done"
              : "pending"),
          kind: enriched.kind ?? input.kind ?? "task",
          status: "open",
          createdAt: stamp,
          updatedAt: stamp,
          dueAt: input.dueAt ?? null,
          preferredWindow: input.preferredWindow ?? null,
          hiddenUntil: input.hiddenUntil ?? null,
          startedAt: null,
          workMinutes: enriched.workMinutes ?? input.workMinutes ?? 15,
          waitMinutes: enriched.waitMinutes ?? input.waitMinutes ?? 0,
          effort: enriched.effort ?? input.effort ?? 2,
          priority:
            input.priority ?? (catalogish ? (enriched.priority ?? 1) : 2),
          dependsOn: input.dependsOn ?? [],
          steps: input.steps ?? [],
          templateId: input.templateId ?? null,
          recurrenceDays: input.recurrenceDays ?? null,
          occurrenceOf: null,
          notes: input.notes ?? "",
          completedAt: null,
          actualWorkMinutes: null,
          relatedMemberIds: input.relatedMemberIds ?? [],
          homeAreaIds: input.homeAreaIds ?? [],
        });
        break;
      }
      case "task.update":
        Object.assign(task(action.id), action.patch, { updatedAt: stamp });
        break;
      case "task.defer": {
        const t = task(action.id);
        t.hiddenUntil = nextDayStart(now, s.profile.timezone);
        t.updatedAt = stamp;
        break;
      }
      case "task.deferUntil": {
        const t = task(action.id);
        t.hiddenUntil = action.hiddenUntil;
        t.updatedAt = stamp;
        break;
      }
      case "task.start": {
        const t = task(action.id);
        if (t.status === "done" || t.status === "cancelled")
          throw new Error("לא ניתן להתחיל משימה שכבר נסגרה.");
        t.status = "in_progress";
        t.startedAt = stamp;
        t.updatedAt = stamp;
        if (s.planning.plan) {
          const item = s.planning.plan.items.find((i) => i.taskId === t.id);
          if (item) {
            item.planStatus = "in_progress";
            item.locked = true;
            s.planning.plan.updatedAt = stamp;
          }
        }
        break;
      }
      case "task.step": {
        const t = task(action.id);
        const step = t.steps.find((x) => x.id === action.stepId);
        if (!step) throw new Error("השלב לא נמצא.");
        step.done = action.done;
        t.updatedAt = stamp;
        break;
      }
      case "task.status": {
        const t = task(action.id);
        if (t.status === action.status) break;
        t.status = action.status;
        t.updatedAt = stamp;
        t.completedAt = action.status === "done" ? stamp : null;
        if (action.status === "in_progress" && !t.startedAt)
          t.startedAt = stamp;
        if (action.status !== "in_progress" && action.status !== "open")
          t.startedAt = t.startedAt;
        if (action.status === "open") t.startedAt = null;
        t.actualWorkMinutes =
          action.status === "done" ? (action.actualWorkMinutes ?? null) : null;
        if (s.planning.plan) {
          const item = s.planning.plan.items.find((i) => i.taskId === t.id);
          if (item) {
            if (action.status === "done") item.planStatus = "done";
            if (action.status === "in_progress") {
              item.planStatus = "in_progress";
              item.locked = true;
            }
            s.planning.plan.updatedAt = stamp;
          }
        }
        if (action.status === "done" || action.status === "cancelled")
          s.reminders
            .filter((r) => r.taskId === t.id && r.status === "pending")
            .forEach((r) => (r.status = "cancelled"));
        if (action.status === "done" && isLifeAdminTask(t)) {
          const minutes = now.getHours() * 60 + now.getMinutes();
          s.compactedMemory = {
            ...s.compactedMemory,
            lifeAdminWindow: recordLifeAdminCompletion(
              s.compactedMemory.lifeAdminWindow,
              minutes,
            ),
            updatedAt: stamp,
          };
        }
        if (
          action.status === "done" &&
          t.recurrenceDays &&
          !s.tasks.some((x) => x.occurrenceOf === t.id)
        ) {
          const next = addCalendarDays(
            t.dueAt && new Date(t.dueAt) > now ? t.dueAt : stamp,
            t.recurrenceDays,
            s.profile.timezone,
          );
          s.tasks.push({
            ...structuredClone(t),
            id: crypto.randomUUID(),
            status: "open",
            createdAt: stamp,
            updatedAt: stamp,
            completedAt: null,
            actualWorkMinutes: null,
            startedAt: null,
            occurrenceOf: t.id,
            dueAt: next,
            hiddenUntil: next,
            steps: t.steps.map((x) => ({ ...x, done: false })),
            dependsOn: [],
          });
        }
        if (action.status === "open")
          s.tasks = s.tasks.filter(
            (x) => !(x.occurrenceOf === t.id && x.status === "open"),
          );
        break;
      }
      case "shopping.add": {
        const existing = s.shopping.find(
          (i) =>
            !i.purchasedAt && normalize(i.title) === normalize(action.title),
        );
        if (existing) {
          if (action.quantity) existing.quantity = action.quantity;
        } else
          s.shopping.push({
            id: crypto.randomUUID(),
            title: action.title.trim(),
            quantity: action.quantity ?? "",
            purchasedAt: null,
            createdAt: stamp,
          });
        break;
      }
      case "shopping.check": {
        const item = s.shopping.find((x) => x.id === action.id);
        if (!item) throw new Error("הפריט לא נמצא.");
        item.purchasedAt = action.checked ? stamp : null;
        break;
      }
      case "shopping.remove":
        s.shopping = s.shopping.filter((x) => x.id !== action.id);
        break;
      case "fact.add": {
        if (
          action.kind === "temporary" &&
          (!action.expiresAt || new Date(action.expiresAt) <= now)
        )
          throw new Error("מידע זמני צריך תוקף עתידי.");
        const isDup = s.facts.some(
          (f) =>
            normalize(f.text) === normalize(action.text) &&
            f.expiresAt === action.expiresAt,
        );
        if (!isDup)
          s.facts.push({
            id: crypto.randomUUID(),
            text: action.text,
            kind: action.kind,
            expiresAt: action.expiresAt,
            createdAt: stamp,
            source: "user",
          });
        const forecastMatch = FORECAST_FACT_RE.exec(action.text.trim());
        if (forecastMatch) {
          // Structured semantic marker — still apply even if fact text was deduped.
          const next = applyForecastEvent(s, {
            type: forecastMatch[1]!.toLowerCase() as
              "replenishment" | "depletion" | "correction",
            subject: forecastMatch[2]!.trim(),
            occurredAt: stamp,
          });
          s.learning = next.learning;
        }
        break;
      }
      case "fact.update": {
        const fact = s.facts.find((x) => x.id === action.id);
        if (!fact) throw new Error("הפרט לא נמצא בזיכרון.");
        const nextKind = action.patch.kind ?? fact.kind;
        const nextExpiry =
          action.patch.expiresAt === undefined
            ? fact.expiresAt
            : action.patch.expiresAt;
        if (
          nextKind === "temporary" &&
          (!nextExpiry || new Date(nextExpiry) <= now)
        )
          throw new Error("מידע זמני צריך תוקף עתידי.");
        Object.assign(fact, action.patch);
        break;
      }
      case "fact.remove":
        s.facts = s.facts.filter((x) => x.id !== action.id);
        break;
      case "reminder.add": {
        if (new Date(action.dueAt) <= now)
          throw new Error("מועד התזכורת צריך להיות בעתיד.");
        if (action.taskId) task(action.taskId);
        if (
          !isDuplicatePendingReminder(s.reminders, {
            title: action.title,
            dueAt: action.dueAt,
            taskId: action.taskId,
          })
        )
          s.reminders.push({
            id: crypto.randomUUID(),
            title: action.title,
            dueAt: action.dueAt,
            taskId: action.taskId,
            status: "pending",
            urgency: action.urgency ?? "medium",
          });
        break;
      }
      case "reminder.cancel": {
        const r = s.reminders.find((x) => x.id === action.id);
        if (r) r.status = "cancelled";
        break;
      }
      case "planning.set":
        s.planning.today = action.constraint;
        break;
      case "planning.clear":
        s.planning.today = null;
        break;
      case "plan.set":
        s.planning.plan = action.plan;
        break;
      case "plan.clear":
        s.planning.plan = null;
        break;
      case "plan.itemUpdate": {
        if (!s.planning.plan) throw new Error("אין תוכנית יום פעילה.");
        const item = s.planning.plan.items.find(
          (i) => i.taskId === action.taskId,
        );
        if (!item) throw new Error("הפריט לא נמצא בתוכנית.");
        Object.assign(item, action.patch);
        s.planning.plan.updatedAt = stamp;
        break;
      }
      case "profile.update":
        Object.assign(s.profile, action.patch);
        break;
      case "template.exclude":
        if (!s.excludedTemplates.includes(action.id))
          s.excludedTemplates.push(action.id);
        break;
      case "template.restore":
        s.excludedTemplates = s.excludedTemplates.filter(
          (x) => x !== action.id,
        );
        break;
      case "message.add":
        s.messages.push({
          id: crypto.randomUUID(),
          role: action.role,
          text: action.text,
          createdAt: stamp,
          turnId: action.turnId ?? null,
        });
        s.messages = s.messages.slice(-200);
        break;
      case "history.clear":
        s.messages = [];
        s.events = [];
        break;
      case "member.upsert": {
        const id = action.member.id ?? crypto.randomUUID();
        const existing = s.members.find((m) => m.id === id);
        if (existing) {
          Object.assign(existing, {
            name: action.member.name,
            type: action.member.type ?? existing.type,
            aliases: action.member.aliases ?? existing.aliases,
            updatedAt: stamp,
          });
        } else {
          s.members.push({
            id,
            name: action.member.name,
            type: action.member.type ?? "other",
            aliases: action.member.aliases ?? [],
            createdAt: stamp,
            updatedAt: stamp,
          });
        }
        break;
      }
      case "member.remove":
        s.members = s.members.filter((m) => m.id !== action.id);
        break;
      case "suggestion.record": {
        const row = s.suggestionHistory.find((x) => x.taskId === action.taskId);
        if (action.outcome === "suggested") {
          if (!row)
            s.suggestionHistory.push({
              taskId: action.taskId,
              suggestedAt: stamp,
              selectedAt: null,
              declinedAt: null,
            });
          else row.suggestedAt = stamp;
        } else if (action.outcome === "selected") {
          if (row) row.selectedAt = stamp;
          else
            s.suggestionHistory.push({
              taskId: action.taskId,
              suggestedAt: stamp,
              selectedAt: stamp,
              declinedAt: null,
            });
        } else {
          if (row) row.declinedAt = stamp;
          else
            s.suggestionHistory.push({
              taskId: action.taskId,
              suggestedAt: stamp,
              selectedAt: null,
              declinedAt: stamp,
            });
        }
        s.suggestionHistory = s.suggestionHistory.slice(-500);
        break;
      }
      case "operation.record":
        s.operations.push({
          turnId: action.turnId,
          createdAt: stamp,
          summary: action.summary,
          actionTypes: action.actionTypes,
        });
        s.operations = s.operations.slice(-100);
        break;
      case "pendingIntent.set":
        s.pendingAgentIntent = action.intent;
        break;
      case "pendingIntent.clear":
        s.pendingAgentIntent = null;
        break;
      case "homeArea.upsert": {
        const incoming = action.area;
        const id = incoming.id ?? crypto.randomUUID();
        const existing = s.homeAreas.find((a) => a.id === id);
        if (existing) Object.assign(existing, incoming, { id });
        else
          s.homeAreas.push({
            id,
            type: incoming.type ?? "other",
            name: incoming.name,
            aliases: incoming.aliases ?? [],
            parentAreaId: incoming.parentAreaId ?? null,
            source: incoming.source ?? "user",
          });
        break;
      }
      case "homeArea.remove":
        s.homeAreas = s.homeAreas.filter((a) => a.id !== action.id);
        break;
      case "scan.set":
        s.firstScan = {
          status: action.firstScan.status,
          completedAt: action.firstScan.completedAt ?? null,
          session: action.firstScan.session ?? null,
        };
        break;
      case "memory.lifeAdmin": {
        const window = applyLifeAdminConfirm(
          s.compactedMemory,
          action.completedAtMinutes,
          action.response,
        );
        s.compactedMemory = {
          ...s.compactedMemory,
          lifeAdminWindow: window,
          updatedAt: stamp,
        };
        break;
      }
    }

    if (action.type !== "message.add" && action.type !== "history.clear")
      s.events.push({
        id: crypto.randomUUID(),
        at: stamp,
        type: action.type,
        summary: action.type,
      });
  }

  const visited = new Set<string>();
  const visit = (id: string, path: Set<string>) => {
    if (visited.has(id)) return;
    if (path.size > 100) throw new Error("שרשרת התלות ארוכה מדי.");
    if (path.has(id)) throw new Error("התלות יוצרת מעגל בין משימות.");
    const t = task(id);
    for (const dep of t.dependsOn) visit(dep, new Set([...path, id]));
    visited.add(id);
  };
  s.tasks.forEach((t) => visit(t.id, new Set()));
  s.events = s.events.slice(-500);
  return StateSchema.parse(s);
}

export function activeFacts(s: AppState, now = new Date()) {
  return s.facts.filter((f) => !f.expiresAt || new Date(f.expiresAt) > now);
}

function paceSamples(t: Task, s: AppState) {
  return s.tasks
    .filter(
      (x) =>
        x.status === "done" &&
        x.actualWorkMinutes &&
        (t.templateId
          ? x.templateId === t.templateId
          : normalize(x.title) === normalize(t.title)),
    )
    .map((x) => x.actualWorkMinutes!)
    .slice(-10)
    .sort((a, b) => a - b);
}

export function estimatedMinutes(t: Task, s: AppState) {
  const samples = paceSamples(t, s);
  return samples.length >= 3
    ? samples[Math.floor(samples.length / 2)]
    : t.workMinutes;
}

export function shouldAskWorkTime(t: Task, s: AppState) {
  const samples = paceSamples(t, s).length;
  if (samples < 3) return true;
  const matchingCompletions = s.tasks.filter(
    (x) =>
      x.status === "done" &&
      (t.templateId
        ? x.templateId === t.templateId
        : normalize(x.title) === normalize(t.title)),
  ).length;
  return matchingCompletions % 4 === 0;
}

export function visible(t: Task, now = new Date()) {
  // Keep status + hiddenUntil gate aligned with domain/tasks/visibility (P01).
  return (
    (t.status === "open" ||
      t.status === "unknown" ||
      t.status === "in_progress") &&
    !isHiddenUntilFuture(t.hiddenUntil, now)
  );
}

export type PlanScoreOpts = {
  /** Ephemeral scheduling preference for this plan build — not persisted task priority. */
  requestedTodayTaskIds?: ReadonlySet<string>;
};

export function score(
  t: Task,
  s: AppState,
  now = new Date(),
  opts?: PlanScoreOpts,
) {
  let n = t.priority * 10;
  if (t.kind === "idea") n -= 35;
  if (t.dueAt) {
    const hours = msUntil(t.dueAt, now) / 3600000;
    n += hours < 0 ? 100 : hours < 24 ? 70 : hours < 72 ? 30 : 0;
  }
  n +=
    s.tasks.filter((x) => x.status === "open" && x.dependsOn.includes(t.id))
      .length * 15;

  if (opts?.requestedTodayTaskIds?.has(t.id)) n += 80;

  // Soft routine bonus (deadline urgency above still dominates).
  const dayOfWeek = (() => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: s.profile.timezone,
      weekday: "short",
    }).format(now);
    const map: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    return map[parts] ?? now.getDay();
  })();
  const cleaningDays = s.profile.householdRoutines?.cleaningDays ?? [];
  const cleaner = s.profile.cleaner;
  const heavyCleanerEligible =
    t.categoryId === "cleaning_reset" ||
    t.categoryId === "floors" ||
    t.categoryId === "bathroom_toilets" ||
    t.categoryId === "living_spaces" ||
    t.categoryId === "bedrooms_bedding";
  const dailyMaintenance =
    t.categoryId === "laundry" ||
    t.categoryId === "kitchen_dishes" ||
    t.categoryId === "organization_storage";
  if (
    cleaningDays.includes(dayOfWeek) &&
    (heavyCleanerEligible || dailyMaintenance)
  )
    n += 12;
  // Cleaner day: de-prioritize heavy jobs the cleaner can cover; keep daily maintenance.
  if (
    cleaner?.enabled &&
    cleaner.days.includes(dayOfWeek) &&
    heavyCleanerEligible
  )
    n -= 18;

  return n;
}

export function whatMatters(s: AppState, now = new Date()) {
  return s.tasks
    .filter((t) => visible(t, now) && t.kind === "task")
    .sort((a, b) => score(b, s, now) - score(a, s, now))
    .slice(0, 6);
}

export function followUps(s: AppState, now = new Date()) {
  return s.tasks
    .filter(
      (t) =>
        visible(t, now) &&
        t.kind === "task" &&
        (t.status === "unknown" ||
          (t.status === "open" && !!t.dueAt && new Date(t.dueAt) < now)),
    )
    .sort((a, b) => score(b, s, now) - score(a, s, now))
    .slice(0, 3);
}

export function blocked(t: Task, s: AppState) {
  return t.dependsOn.some(
    (id) => s.tasks.find((x) => x.id === id)?.status !== "done",
  );
}

function deadlineAllows(t: Task, end: number, now: Date) {
  if (!t.dueAt) return true;
  const available = (new Date(t.dueAt).getTime() - now.getTime()) / 60000;
  return available >= 0 && end <= available;
}

export function opportunities(
  s: AppState,
  minutes: number,
  effort: number,
  now = new Date(),
) {
  const candidates = s.tasks
    .filter(
      (t) =>
        visible(t, now) &&
        t.status === "open" &&
        !blocked(t, s) &&
        t.effort <= effort &&
        (estimatedMinutes(t, s) + t.waitMinutes) * 1.15 <= minutes &&
        deadlineAllows(t, estimatedMinutes(t, s) + t.waitMinutes, now),
    )
    .sort((a, b) => score(b, s, now) - score(a, s, now));
  const important = whatMatters(s, now).filter(
    (t) =>
      t.dueAt &&
      new Date(t.dueAt).getTime() - now.getTime() < 86400000 &&
      !candidates.includes(t),
  );
  return { candidates: candidates.slice(0, 4), important };
}

type BusyWindow = { start: number; end: number };
function planConstraint(s: AppState, now: Date) {
  const constraint = s.planning.today;
  if (!constraint || constraint.date !== dayKey(now, s.profile.timezone))
    return null;
  return constraint;
}
function minuteOffset(iso: string, now: Date) {
  return msUntil(iso, now) / 60000;
}
function nextWorkStart(start: number, work: number, busy: BusyWindow[]) {
  let next = Math.max(0, start);
  let changed = true;
  while (changed) {
    changed = false;
    for (const window of busy) {
      if (next < window.end && next + work > window.start) {
        next = window.end;
        changed = true;
        break;
      }
    }
  }
  return next;
}

function preferredWindowAllows(t: Task, start: number, end: number, now: Date) {
  const win = t.preferredWindow;
  if (!win?.start && !win?.end) return true;
  // Explicit preferred window is a hard scheduling constraint for planDay.
  if (win.start) {
    const winStart = minuteOffset(win.start, now);
    if (end <= winStart) return false;
    if (start < winStart) return false;
  }
  if (win.end) {
    const winEnd = minuteOffset(win.end, now);
    if (start >= winEnd) return false;
    if (end > winEnd) return false;
  }
  return true;
}

export function planDay(
  s: AppState,
  minutes: number,
  effort: number,
  now = new Date(),
  opts?: PlanScoreOpts,
) {
  const constraint = planConstraint(s, now);
  const startFloor = constraint?.availableFrom
    ? Math.max(0, minuteOffset(constraint.availableFrom, now))
    : 0;
  const availabilityEnd = constraint?.availableUntil
    ? Math.max(0, minuteOffset(constraint.availableUntil, now))
    : minutes;
  const planEnd = Math.min(minutes, availabilityEnd);
  const allowedEffort = Math.min(effort, constraint?.effort ?? effort);
  const busy: BusyWindow[] = (constraint?.unavailable ?? [])
    .map((x) => ({
      start: minuteOffset(x.start, now),
      end: minuteOffset(x.end, now),
    }))
    .filter((x) => x.end > 0 && x.start < planEnd)
    .sort((a, b) => a.start - b.start);

  const remaining = s.tasks
    .filter(
      (t) =>
        visible(t, now) &&
        t.status === "open" &&
        t.kind === "task" &&
        t.effort <= allowedEffort,
    )
    .sort((a, b) => score(b, s, now, opts) - score(a, s, now, opts));
  const selected: { task: Task; start: number; end: number }[] = [];
  let workCursor = startFloor;
  const finished = new Map<string, number>(
    s.tasks.filter((t) => t.status === "done").map((t) => [t.id, 0]),
  );

  for (let pass = 0; pass < s.tasks.length && remaining.length; pass++) {
    let progress = false;
    for (let i = 0; i < remaining.length; i++) {
      const t = remaining[i];
      if (t.dependsOn.some((id) => !finished.has(id))) continue;
      const dependencyReady = Math.max(
        startFloor,
        ...t.dependsOn.map((id) => finished.get(id) ?? startFloor),
      );
      const work = estimatedMinutes(t, s);
      let rawStart = Math.max(workCursor, dependencyReady);
      if (t.preferredWindow?.start) {
        rawStart = Math.max(
          rawStart,
          minuteOffset(t.preferredWindow.start, now),
        );
      }
      const start = nextWorkStart(rawStart, work, busy);
      const end = start + work + t.waitMinutes;
      const bufferedWorkEnd = start + work + Math.ceil(work * 0.15);
      if (
        bufferedWorkEnd > planEnd ||
        end > planEnd ||
        !deadlineAllows(t, end, now) ||
        !preferredWindowAllows(t, start, end, now)
      )
        continue;
      selected.push({ task: t, start, end });
      finished.set(t.id, end);
      workCursor = bufferedWorkEnd;
      remaining.splice(i--, 1);
      progress = true;
    }
    if (!progress) break;
  }
  return { selected, remaining };
}

export function buildDailyPlanSession(
  s: AppState,
  minutes: number,
  effort: 1 | 2 | 3,
  revision: number,
  now = new Date(),
  opts?: PlanScoreOpts,
): import("./model").DailyPlanSession {
  const computed = planDay(s, minutes, effort, now, opts);
  const stamp = now.toISOString();
  return {
    id: crypto.randomUUID(),
    date: dayKey(now, s.profile.timezone),
    createdAt: stamp,
    updatedAt: stamp,
    availableMinutes: minutes,
    effort,
    generatedFromRevision: revision,
    items: computed.selected.map((row, order) => ({
      taskId: row.task.id,
      order,
      plannedStart: new Date(now.getTime() + row.start * 60000).toISOString(),
      plannedEnd: new Date(now.getTime() + row.end * 60000).toISOString(),
      locked: row.task.status === "in_progress",
      planStatus:
        row.task.status === "in_progress"
          ? ("in_progress" as const)
          : ("planned" as const),
    })),
  };
}

export function activeDailyPlan(s: AppState, now = new Date()) {
  const plan = s.planning.plan;
  if (!plan) return null;
  if (plan.date !== dayKey(now, s.profile.timezone)) return null;
  return plan;
}

/**
 * Stable replan: keep past/done/in_progress/locked; rebuild only future unlocked.
 */
export function replanDailyPlan(
  s: AppState,
  now = new Date(),
  opts?: PlanScoreOpts,
): {
  plan: import("./model").DailyPlanSession | null;
  requiresProposal: boolean;
  shiftedTaskIds: string[];
} {
  const existing = activeDailyPlan(s, now);
  if (!existing)
    return { plan: null, requiresProposal: false, shiftedTaskIds: [] };

  const preserved = existing.items.filter((item) => {
    const task = s.tasks.find((t) => t.id === item.taskId);
    if (!task) return false;
    if (
      item.locked ||
      item.planStatus === "done" ||
      item.planStatus === "in_progress"
    )
      return true;
    if (task.status === "done" || task.status === "in_progress") return true;
    if (item.plannedEnd && Date.parse(item.plannedEnd) <= now.getTime())
      return true;
    return false;
  });

  const preservedIds = new Set(preserved.map((i) => i.taskId));
  const usedMinutes = preserved.reduce((sum, item) => {
    if (!item.plannedStart || !item.plannedEnd) return sum;
    return (
      sum +
      Math.max(
        0,
        (Date.parse(item.plannedEnd) - Date.parse(item.plannedStart)) / 60000,
      )
    );
  }, 0);
  const remainingMinutes = Math.max(0, existing.availableMinutes - usedMinutes);
  if (remainingMinutes <= 0) {
    return {
      plan: {
        ...existing,
        updatedAt: now.toISOString(),
        items: preserved.map((i, order) => ({ ...i, order })),
      },
      requiresProposal: false,
      shiftedTaskIds: existing.items
        .filter((i) => !preservedIds.has(i.taskId))
        .map((i) => i.taskId),
    };
  }
  const shadow: AppState = {
    ...s,
    tasks: s.tasks.map((t) =>
      preservedIds.has(t.id) && t.status === "open"
        ? { ...t, hiddenUntil: nextDayStart(now, s.profile.timezone) }
        : t,
    ),
  };
  const rebuilt = planDay(
    shadow,
    remainingMinutes,
    existing.effort as 1 | 2 | 3,
    now,
    opts,
  );
  const futureItems = rebuilt.selected
    .filter((row) => !preservedIds.has(row.task.id))
    .map((row, idx) => ({
      taskId: row.task.id,
      order: preserved.length + idx,
      plannedStart: new Date(now.getTime() + row.start * 60000).toISOString(),
      plannedEnd: new Date(now.getTime() + row.end * 60000).toISOString(),
      locked: false,
      planStatus: "planned" as const,
    }));

  const oldFuture = existing.items
    .filter((i) => !preservedIds.has(i.taskId))
    .map((i) => i.taskId);
  const newFuture = futureItems.map((i) => i.taskId);
  const shiftedTaskIds = [
    ...oldFuture.filter((id) => !newFuture.includes(id)),
    ...newFuture.filter((id) => !oldFuture.includes(id)),
  ];
  const requiresProposal = shiftedTaskIds.length >= 2;

  return {
    plan: {
      ...existing,
      updatedAt: now.toISOString(),
      items: [
        ...preserved.map((i, order) => ({ ...i, order })),
        ...futureItems,
      ],
    },
    requiresProposal,
    shiftedTaskIds,
  };
}

export function freeTimeV2(
  s: AppState,
  minutes: number,
  effort: number,
  now = new Date(),
) {
  const plan = activeDailyPlan(s, now);
  const plannedIds = new Set(plan?.items.map((i) => i.taskId) ?? []);
  const declineCounts = new Map<string, number>();
  for (const row of s.suggestionHistory) {
    if (row.declinedAt)
      declineCounts.set(row.taskId, (declineCounts.get(row.taskId) ?? 0) + 1);
  }

  const fits = (t: Task) =>
    visible(t, now) &&
    t.status === "open" &&
    t.status !== ("in_progress" as string) &&
    !blocked(t, s) &&
    t.effort <= effort &&
    (estimatedMinutes(t, s) + t.waitMinutes) * 1.15 <= minutes &&
    (!t.hiddenUntil || new Date(t.hiddenUntil) <= now);

  const closeFirst = s.tasks
    .filter((t) => fits(t))
    .filter(
      (t) =>
        (t.dueAt && new Date(t.dueAt) < now) ||
        (t.dueAt && new Date(t.dueAt).getTime() - now.getTime() < 86400000) ||
        t.priority >= 3 ||
        plannedIds.has(t.id),
    )
    .sort((a, b) => {
      const da = declineCounts.get(a.id) ?? 0;
      const db = declineCounts.get(b.id) ?? 0;
      return score(b, s, now) - da * 5 - (score(a, s, now) - db * 5);
    })
    .slice(0, 4);

  const outsidePlan = s.tasks
    .filter((t) => fits(t) && !plannedIds.has(t.id) && !closeFirst.includes(t))
    .filter((t) => t.kind === "idea" || t.kind === "task")
    .sort((a, b) => {
      const da = declineCounts.get(a.id) ?? 0;
      const db = declineCounts.get(b.id) ?? 0;
      return score(b, s, now) - da * 8 - (score(a, s, now) - db * 8);
    })
    .slice(0, 4);

  return { closeFirst, outsidePlan };
}

export function findSemanticDuplicate(
  s: AppState,
  title: string,
  opts: {
    categoryId?: string;
    detailTypeId?: string | null;
    dueAt?: string | null;
    memberIds?: string[];
    /** Location-aware: non-overlapping areas do not merge (P36). */
    homeAreaIds?: string[];
  } = {},
) {
  const needle = normalize(title);
  return s.tasks.find((t) => {
    if (t.status !== "open" && t.status !== "in_progress") return false;
    if (opts.categoryId && t.categoryId !== opts.categoryId) return false;
    // detailTypeId is a hint only — starter sink_clean may merge with scan dishes_handwash (P35).
    if ((opts.dueAt ?? null) !== t.dueAt) return false;
    if (opts.memberIds?.length) {
      const sameMember = opts.memberIds.some((id) =>
        t.relatedMemberIds.includes(id),
      );
      if (!sameMember) return false;
    }
    const incomingAreas = opts.homeAreaIds ?? [];
    if (incomingAreas.length && t.homeAreaIds.length) {
      const overlap = incomingAreas.some((id) => t.homeAreaIds.includes(id));
      if (!overlap) return false;
    }
    const hay = normalize(t.title);
    if (hay === needle) return true;
    if (hay.includes(needle) || needle.includes(hay)) return true;
    // Hebrew stem-ish overlap for dishwasher empty / fold laundry style paraphrases
    const tokens = (s: string) => s.split(" ").filter((w) => w.length > 2);
    const a = new Set(tokens(hay));
    const b = tokens(needle);
    const overlap = b.filter((w) =>
      [...a].some((x) => x.includes(w) || w.includes(x)),
    );
    return overlap.length >= 1;
  });
}

export function learning(s: AppState) {
  const groups = new Map<string, Task[]>();
  s.tasks
    .filter((t) => t.status === "done" && t.completedAt)
    .forEach((t) => {
      const key = t.templateId ?? normalize(t.title);
      groups.set(key, [...(groups.get(key) ?? []), t]);
    });
  return [...groups.values()]
    .filter((g) => g.length >= 4)
    .map((g) => {
      const sorted = g.sort((a, b) =>
        a.completedAt!.localeCompare(b.completedAt!),
      );
      const intervals = sorted
        .slice(1)
        .map(
          (t, i) =>
            (Date.parse(t.completedAt!) - Date.parse(sorted[i].completedAt!)) /
            86400000,
        );
      const median = [...intervals].sort((a, b) => a - b)[
        Math.floor(intervals.length / 2)
      ];
      const consistent =
        median >= 1 &&
        intervals.filter((x) => Math.abs(x - median) <= median * 0.3).length >=
          3;
      return {
        title: g[0].title,
        templateId: g[0].templateId,
        days: Math.round(median),
        samples: g.length,
        consistent,
      };
    })
    .filter((x) => x.consistent);
}
