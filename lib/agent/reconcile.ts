import type { AgentAction, TaskRow } from "../types.ts";
import type { ShoppingItem } from "../lists.ts";
import { normalizeExactText } from "../task-identity.ts";
import type { AgentTurnFlags } from "./turn-flags.ts";
import { DEFAULT_TURN_FLAGS } from "./turn-flags.ts";

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

      if (action.id && byId.has(action.id)) {
        out.push({
          ...action,
          type: "task.update",
          id: action.id,
        });
        continue;
      }

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
        const match = action.title
          ? openTasks.find((task) => titlesRelated(task.title, action.title!))
          : null;
        if (match) {
          out.push({ ...action, id: match.id });
          continue;
        }
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
 * unless the agent marked this turn as a one-shot override via turn_flags.
 */
export function expandLearnedFollowUps(input: {
  actions: AgentAction[];
  relations: Array<{
    trigger: string;
    followupTitle: string;
    ordering: "after" | "with";
  }>;
  openTasks: TaskRow[];
  turnFlags?: AgentTurnFlags;
}): AgentAction[] {
  const flags = input.turnFlags ?? DEFAULT_TURN_FLAGS;
  if (flags.suppress_learned_followups) return input.actions;
  if (!input.relations.length) return input.actions;

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

/**
 * Block standing memory writes for one-shot overrides unless the agent
 * explicitly marks standing_rule_change.
 */
export function filterMemoryWritesForException(input: {
  actions: AgentAction[];
  turnFlags?: AgentTurnFlags;
}): AgentAction[] {
  const flags = input.turnFlags ?? DEFAULT_TURN_FLAGS;
  if (!flags.suppress_learned_followups) return input.actions;
  if (flags.standing_rule_change) return input.actions;
  return input.actions.filter((action) => action.type !== "memory.upsert");
}
