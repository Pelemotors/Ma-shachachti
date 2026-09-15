import type { AgentAction, MemoryRow, TaskRow } from "../types.ts";
import type { ShoppingItem } from "../lists.ts";
import { normalizeExactText } from "../task-identity.ts";

/**
 * Linguistic markers for one-time exception scope (not domain keywords).
 * Used only to suppress learned follow-ups for the current turn.
 */
const ONE_SHOT_EXCEPTION_RE =
  /הפעם\s+בלי|בלי[^.!?\n]{0,40}הפעם|לא\s+הפעם|רק\s+הפעם|without\s+.{0,40}\sthis\s+time|this\s+time\s+without/i;

export function isOneShotException(userMessage: string): boolean {
  return ONE_SHOT_EXCEPTION_RE.test(userMessage);
}

function titleKey(value: string | null | undefined) {
  return normalizeExactText(value ?? "").toLowerCase();
}

function titlesRelated(a: string, b: string) {
  const left = titleKey(a);
  const right = titleKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 4 && right.includes(left)) return true;
  if (right.length >= 4 && left.includes(right)) return true;
  return false;
}

/**
 * Reconcile proposed actions toward desired final state:
 * - prefer update over duplicate create when a strong id or matching open entity exists
 * - collapse duplicate creates in the same batch
 * - keep idempotent updates that already match target as no-ops (dropped)
 */
export function reconcileActions(input: {
  actions: AgentAction[];
  openTasks: TaskRow[];
  shopping?: ShoppingItem[];
  userMessage?: string;
}): AgentAction[] {
  const openTasks = input.openTasks.filter((task) => task.status === "open");
  const byId = new Map(openTasks.map((task) => [task.id, task]));
  const shopping = input.shopping ?? [];
  const out: AgentAction[] = [];
  const createdTitles = new Set<string>();

  for (const action of input.actions) {
    if (action.type === "task.create") {
      const title = action.title?.trim() ?? "";
      if (!title) continue;
      const key = titleKey(title);

      // Strong id already supplied → treat as update of that entity.
      if (action.id && byId.has(action.id)) {
        out.push({
          ...action,
          type: "task.update",
          id: action.id,
        });
        continue;
      }

      // Match existing open task by exact/related title → update instead of create.
      const match = openTasks.find((task) => titlesRelated(task.title, title));
      if (match) {
        out.push({
          ...action,
          type: "task.update",
          id: match.id,
          title: action.title ?? match.title,
        });
        continue;
      }

      if (createdTitles.has(key)) continue;
      createdTitles.add(key);
      out.push(action);
      continue;
    }

    if (action.type === "task.update" || action.type === "task.reschedule") {
      if (action.id && !byId.has(action.id)) {
        // Stale id — if title matches an open task, retarget.
        const match = action.title
          ? openTasks.find((task) => titlesRelated(task.title, action.title!))
          : null;
        if (match) {
          out.push({ ...action, id: match.id });
          continue;
        }
        // Ambiguous / missing — skip rather than create duplicate.
        continue;
      }
      out.push(action);
      continue;
    }

    if (action.type === "task.delete" || action.type === "task.complete") {
      if (action.id && !byId.has(action.id)) continue;
      out.push(action);
      continue;
    }

    if (action.type === "shopping.add") {
      const title = action.title?.trim() ?? "";
      if (!title) continue;
      const key = titleKey(title);
      const existing = shopping.find(
        (item) => !item.purchased_at && titleKey(item.title) === key,
      );
      if (existing) {
        out.push({
          ...action,
          type: "shopping.update",
          id: existing.id,
          title: existing.title,
        });
        continue;
      }
      if (createdTitles.has(`shop:${key}`)) continue;
      createdTitles.add(`shop:${key}`);
      out.push(action);
      continue;
    }

    out.push(action);
  }

  return out;
}

/**
 * After primary creates, expand learned follow-up relations into extra creates
 * unless the current message is a one-shot exception.
 */
export function expandLearnedFollowUps(input: {
  actions: AgentAction[];
  relations: Array<{
    trigger: string;
    followupTitle: string;
    ordering: "after" | "with";
  }>;
  openTasks: TaskRow[];
  userMessage: string;
}): AgentAction[] {
  if (!input.relations.length) return input.actions;
  if (isOneShotException(input.userMessage)) return input.actions;

  const creates = input.actions.filter((action) => action.type === "task.create");
  if (!creates.length) return input.actions;

  const existingTitles = new Set(
    [
      ...input.openTasks.map((task) => titleKey(task.title)),
      ...input.actions
        .filter((action) => action.type === "task.create" && action.title)
        .map((action) => titleKey(action.title!)),
    ].filter(Boolean),
  );

  const extras: AgentAction[] = [];
  for (const create of creates) {
    const title = create.title ?? "";
    for (const relation of input.relations) {
      if (!titlesRelated(title, relation.trigger)) continue;
      const followKey = titleKey(relation.followupTitle);
      if (!followKey || existingTitles.has(followKey)) continue;
      // Also skip if any action already targets this follow-up.
      const already = input.actions.some(
        (action) =>
          (action.type === "task.create" || action.type === "task.update") &&
          action.title &&
          titlesRelated(action.title, relation.followupTitle),
      );
      if (already) continue;
      existingTitles.add(followKey);
      extras.push({
        type: "task.create",
        id: null,
        title: relation.followupTitle,
        notes: null,
        due_on: create.due_on,
        due_time: create.due_time,
        due_patch: create.due_patch,
        reminder_enabled: null,
        reminder_at: null,
        reminder_at_patch: null,
        reminder_offset_minutes: null,
        reminder_patch: null,
        plan_patch: null,
        planned_date: null,
        planned_start_time: null,
        planned_end_time: null,
        kind: null,
        content: null,
        confidence: null,
        silent: null,
      });
    }
  }

  return extras.length ? [...input.actions, ...extras] : input.actions;
}

/** Prefer not to persist one-shot exceptions as standing preferences. */
export function filterMemoryWritesForException(input: {
  actions: AgentAction[];
  userMessage: string;
}): AgentAction[] {
  if (!isOneShotException(input.userMessage)) return input.actions;
  return input.actions.filter((action) => {
    if (action.type !== "memory.upsert") return true;
    // Allow explicit general-rule changes only when message also signals a standing change.
    const standing =
      /מעכשיו|תמיד|בדרך כלל|מהיום|from now|always|generally/i.test(
        input.userMessage,
      );
    return standing;
  });
}
