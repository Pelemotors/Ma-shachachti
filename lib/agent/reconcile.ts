import type { AgentAction, TaskRow } from "../types.ts";
import type { ShoppingItem } from "../lists.ts";
import {
  findRelatedOpenTask,
  findRelatedOpenTasks,
  isCancelUtterance,
  isCompletionUtterance,
  isRelatedTaskMention,
  normalizeExactText,
} from "../task-identity.ts";
import type { AgentTurnFlags } from "./turn-flags.ts";
import { DEFAULT_TURN_FLAGS } from "./turn-flags.ts";

function titleKey(value: string | null | undefined) {
  return normalizeExactText(value ?? "").toLowerCase();
}

/** Strip buy verbs / fillers so shopping titles stay short product names. */
export function normalizeShoppingTitle(value: string | null | undefined): string {
  let next = normalizeExactText(value ?? "");
  next = next
    .replace(/^(?:גם\s+|עוד\s+|בבקשה\s+|אם\s+אין\s+)/u, "")
    .replace(
      /^(?:לקנות|קנו|קניתי|קנה|קנתה|נגמר|צריך|צריכה|תוסיפ[ויי]?)\s+/u,
      "",
    )
    .replace(/\s+(?:לקניות|לרשימת הקניות|אם אין)$/u, "")
    .replace(/^(?:את\s+)/u, "")
    .trim();
  return next.slice(0, 80);
}

/**
 * Reject conversational/task sentences that must never become shopping entities.
 * Concise noun phrases (קפה, סבון כביסה) pass; verb-led tasks do not.
 */
export function isPlausibleShoppingTitle(value: string | null | undefined): boolean {
  const title = normalizeShoppingTitle(value);
  if (!title || title.length < 2 || title.length > 40) return false;
  if (/[.!?…]/.test(title)) return false;
  if (
    /^(?:ל|ו)?(?:קבוע|שלם|בדוק|בדיקה|היה|היות|זכור|קח|קחת|סדר|תזכיר|תעביר|תעדכן|תוריד|הזמין)/u.test(
      title,
    )
  ) {
    return false;
  }
  if (
    /^(?:לקבוע|לשלם|לבדוק|להיות|לזכור|לקחת|לסדר|להזמין|ומתישהו|נראה\s+לי)/u.test(
      title,
    )
  ) {
    return false;
  }
  if (
    /(?:^|\s)(?:קניתי|קנה|קנתה|תוריד|תוסיף|אם אין|אז )(?:\s|$)/u.test(title) &&
    title.split(/\s+/).length >= 4
  ) {
    return false;
  }
  // Long multi-token logistics phrases without a short product core.
  if (title.split(/\s+/).length >= 5) return false;
  return true;
}

function shoppingTitlesRelated(a: string, b: string) {
  if (titlesRelated(a, b)) return true;
  // Short product nouns (חלב, לחם) need includes even below titlesRelated's ≥4 gate.
  const left = titleKey(a);
  const right = titleKey(b);
  if (left.length >= 2 && right.includes(left)) return true;
  if (right.length >= 2 && left.includes(right)) return true;
  return false;
}

/** Soft match: drop Hebrew function particle את and definite ה- prefix on tokens. */
function softTitleKey(value: string | null | undefined) {
  return titleKey(value)
    .replace(/(^|\s)את(\s|$)/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) =>
      token.length > 2 && token.startsWith("ה") ? token.slice(1) : token,
    )
    .join(" ");
}

function titlesRelated(a: string, b: string) {
  const left = titleKey(a);
  const right = titleKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 4 && right.includes(left)) return true;
  if (right.length >= 4 && left.includes(right)) return true;
  const leftSoft = softTitleKey(a);
  const rightSoft = softTitleKey(b);
  if (leftSoft && rightSoft && leftSoft === rightSoft) return true;
  const leftTokens = leftSoft.split(" ").filter((token) => token.length >= 2);
  const rightTokens = rightSoft.split(" ").filter((token) => token.length >= 2);
  if (
    leftTokens.length >= 2 &&
    leftTokens.every((token) => rightTokens.includes(token))
  ) {
    return true;
  }
  if (
    rightTokens.length >= 2 &&
    rightTokens.every((token) => leftTokens.includes(token))
  ) {
    return true;
  }
  return false;
}

function blankLifecycleFields(partial: Partial<AgentAction> & Pick<AgentAction, "type">): AgentAction {
  return {
    id: null,
    title: null,
    notes: null,
    due_on: null,
    due_time: null,
    due_patch: null,
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
    ...partial,
  };
}

/** Timed due (date+time) must land on day_plan — Home's SoT — without a full replan. */
function ensureTimedDayPlan(action: AgentAction): AgentAction {
  if (
    action.type !== "task.create" &&
    action.type !== "task.update" &&
    action.type !== "task.reschedule"
  ) {
    return action;
  }
  if (action.plan_patch === "set" || action.plan_patch === "clear") return action;
  const dueOn = action.due_on?.trim() || null;
  const dueTime = action.due_time?.trim() || null;
  if (!dueOn || !dueTime) return action;
  if (action.type !== "task.create" && action.due_patch !== "set") return action;
  return {
    ...action,
    plan_patch: "set",
    planned_date: dueOn,
    planned_start_time: dueTime,
    planned_end_time: action.planned_end_time ?? null,
  };
}

function pushCompletes(
  out: AgentAction[],
  matches: TaskRow[],
) {
  for (const match of matches) {
    out.push(
      blankLifecycleFields({
        type: "task.complete",
        id: match.id,
        title: match.title,
      }),
    );
  }
}

/**
 * Reconcile proposed actions toward desired final state:
 * - prefer update over duplicate create when a strong id or matching open entity exists
 * - completion utterances complete related open tasks (not shopping substitutes)
 * - collapse duplicate creates in the same batch
 * - timed due writes a point day_plan item
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
  const completedIds = new Set<string>();

  for (const action of input.actions) {
    if (action.type === "task.create") {
      const title = action.title?.trim() ?? "";
      if (!title) continue;
      const key = titleKey(title);

      if (action.id && byId.has(action.id)) {
        out.push(ensureTimedDayPlan({
          ...action,
          type: "task.update",
          id: action.id,
        }));
        continue;
      }

      const utterance = `${input.userMessage ?? ""} ${title}`;
      const completion = isCompletionUtterance(utterance);
      const cancel = isCancelUtterance(utterance);
      const matches =
        findRelatedOpenTasks(openTasks, title, { completion: completion || cancel });
      const match =
        matches[0] ??
        openTasks.find((task) => titlesRelated(task.title, title)) ??
        null;
      if (match && completion) {
        const all = matches.length
          ? matches
          : findRelatedOpenTasks(openTasks, title, { completion: true });
        const unique = all.filter((row) => !completedIds.has(row.id));
        for (const row of unique) completedIds.add(row.id);
        pushCompletes(out, unique.length ? unique : [match]);
        continue;
      }
      if (match && cancel) {
        out.push(
          blankLifecycleFields({
            type: "task.delete",
            id: match.id,
            title: match.title,
          }),
        );
        continue;
      }
      if (match) {
        out.push(
          ensureTimedDayPlan({
            ...action,
            type: "task.update",
            id: match.id,
            title: action.title ?? match.title,
          }),
        );
        continue;
      }

      if (createdTitles.has(key)) continue;
      createdTitles.add(key);
      out.push(ensureTimedDayPlan(action));
      continue;
    }

    if (action.type === "task.update" || action.type === "task.reschedule") {
      if (action.id && byId.has(action.id)) {
        out.push(ensureTimedDayPlan(action));
        continue;
      }
      const hint = action.title || input.userMessage || "";
      const match = hint ? findRelatedOpenTask(openTasks, hint) : null;
      if (match) {
        out.push(ensureTimedDayPlan({ ...action, id: match.id }));
        continue;
      }
      if (action.id) out.push(ensureTimedDayPlan(action));
      continue;
    }

    if (action.type === "task.delete" || action.type === "task.complete") {
      if (
        action.type === "task.complete" &&
        !isCompletionUtterance(input.userMessage) &&
        !isCompletionUtterance(action.title)
      ) {
        // Model sometimes emits complete on status/context updates ("תום מרגיש טוב").
        continue;
      }
      if (action.id && byId.has(action.id)) {
        if (action.type === "task.complete") completedIds.add(action.id);
        out.push(action);
        continue;
      }
      const hint = action.title || input.userMessage || "";
      const matches = hint
        ? findRelatedOpenTasks(openTasks, hint, { completion: true })
        : [];
      if (matches.length) {
        if (action.type === "task.complete") {
          const unique = matches.filter((row) => !completedIds.has(row.id));
          for (const row of unique) completedIds.add(row.id);
          pushCompletes(out, unique);
        } else {
          out.push({ ...action, id: matches[0]!.id, title: matches[0]!.title });
        }
        continue;
      }
      if (action.id) out.push(action);
      continue;
    }

    if (
      action.type === "shopping.add" ||
      action.type === "shopping.update" ||
      action.type === "shopping.toggle" ||
      action.type === "shopping.remove"
    ) {
      const title = action.title?.trim() ?? "";
      const utterance = `${input.userMessage ?? ""} ${title}`;
      if (isCompletionUtterance(utterance)) {
        const hint = `${input.userMessage ?? ""} ${title}`.trim();
        const matches = hint
          ? findRelatedOpenTasks(openTasks, hint, { completion: true })
          : [];
        if (matches.length) {
          const unique = matches.filter((row) => !completedIds.has(row.id));
          for (const row of unique) completedIds.add(row.id);
          pushCompletes(out, unique);
          continue;
        }
      }
      if (action.type === "shopping.add") {
        if (!title) continue;
        const normalized = normalizeShoppingTitle(title) || title;
        if (!isPlausibleShoppingTitle(normalized)) continue;
        const key = titleKey(normalized);
        const existing =
          shopping.find(
            (item) => !item.purchased_at && titleKey(item.title) === key,
          ) ??
          shopping.find(
            (item) =>
              !item.purchased_at && shoppingTitlesRelated(item.title, normalized),
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
        const purchasedSame =
          shopping.find(
            (item) =>
              Boolean(item.purchased_at) &&
              (titleKey(item.title) === key ||
                shoppingTitlesRelated(item.title, normalized)),
          ) ?? null;
        if (purchasedSame) {
          out.push({
            ...blankLifecycleFields({
              type: "shopping.toggle",
              id: purchasedSame.id,
              title: purchasedSame.title,
            }),
            purchased: false,
          });
          continue;
        }
        if (createdTitles.has(`shop:${key}`)) continue;
        createdTitles.add(`shop:${key}`);
        out.push({
          ...action,
          title: normalized,
          quantity: action.quantity ?? 1,
        });
        continue;
      }
      out.push(action);
      continue;
    }

    out.push(action);
  }

  // Completion utterance always closes related open tasks, even when the model
  // only emitted a shopping mutation (or a shopping miss by id).
  if (isCompletionUtterance(input.userMessage)) {
    const matches = findRelatedOpenTasks(
      openTasks,
      input.userMessage ?? "",
      { completion: true },
    );
    if (matches.length) {
      const withoutShopping = out.filter(
        (action) => !String(action.type).startsWith("shopping."),
      );
      const have = new Set(
        withoutShopping
          .filter((action) => action.type === "task.complete" && action.id)
          .map((action) => action.id as string),
      );
      const missing = matches.filter((row) => !have.has(row.id) && !completedIds.has(row.id));
      for (const row of missing) completedIds.add(row.id);
      pushCompletes(withoutShopping, missing);
      return withoutShopping;
    }
    const hint = input.userMessage ?? "";
    const shopHits = shopping.filter(
      (item) =>
        !item.purchased_at &&
        (shoppingTitlesRelated(item.title, hint) ||
          isRelatedTaskMention(item.title, hint, { completion: true })),
    );
    if (shopHits.length) {
      const withoutShop = out.filter(
        (action) => !String(action.type).startsWith("shopping."),
      );
      for (const item of shopHits) {
        withoutShop.push({
          ...blankLifecycleFields({
            type: "shopping.toggle",
            id: item.id,
            title: item.title,
          }),
          purchased: true,
        });
      }
      return withoutShop;
    }
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
  const updates = input.actions.filter(
    (action) =>
      action.type === "task.update" &&
      (action.title != null ||
        action.due_on != null ||
        action.due_patch === "set"),
  );
  const primaries = [...creates, ...updates];
  if (!primaries.length) return input.actions;

  const existingTitles = new Set(
    [
      ...input.openTasks.map((task) => titleKey(task.title)),
      ...input.actions
        .filter((action) => action.type === "task.create" && action.title)
        .map((action) => titleKey(action.title!)),
    ].filter(Boolean),
  );

  const extras: AgentAction[] = [];
  for (const primary of primaries) {
    const title =
      primary.title ??
      (primary.id
        ? (input.openTasks.find((task) => task.id === primary.id)?.title ?? "")
        : "");
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
        due_on: primary.due_on,
        due_time: primary.due_time,
        due_patch: primary.due_patch,
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
 * During a grounded one-shot exception, drop create/update actions whose title
 * matches a learned follow-up — covers both expander output and model mistakes.
 */
export function filterFollowupCreatesForException(input: {
  actions: AgentAction[];
  relations: Array<{ followupTitle: string }>;
  turnFlags?: AgentTurnFlags;
}): AgentAction[] {
  const flags = input.turnFlags ?? DEFAULT_TURN_FLAGS;
  if (!flags.suppress_learned_followups) return input.actions;
  return input.actions.filter((action) => {
    if (action.type !== "task.create" && action.type !== "task.update") {
      return true;
    }
    const title = action.title ?? "";
    if (!title) return true;
    return !input.relations.some((relation) =>
      titlesRelated(title, relation.followupTitle),
    );
  });
}

/**
 * Block standing memory writes for one-shot overrides unless the agent
 * explicitly marks standing_rule_change.
 * Never block an explicit action_followup teach request (model may misfire flags).
 */
export function filterMemoryWritesForException(input: {
  actions: AgentAction[];
  turnFlags?: AgentTurnFlags;
  userMessage?: string | null;
}): AgentAction[] {
  const flags = input.turnFlags ?? DEFAULT_TURN_FLAGS;
  if (!flags.suppress_learned_followups) return input.actions;
  if (flags.standing_rule_change) return input.actions;
  if (/action_followup/i.test(input.userMessage ?? "")) return input.actions;
  return input.actions.filter((action) => action.type !== "memory.upsert");
}
