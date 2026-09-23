import type { AgentAction, TaskRow } from "../types.ts";
import type { ShoppingItem } from "../lists.ts";
import type { MemoryRow } from "../types.ts";
import type { ClientPresentation } from "../types.ts";
import {
  expandLearnedFollowUps,
  filterFollowupCreatesForException,
  filterMemoryWritesForException,
  reconcileActions,
} from "./reconcile.ts";
import {
  ensureRelationUpsertAction,
  normalizeMemoryRelationActions,
  selectLearnedActionRelations,
} from "./learned-relations.ts";
import { isolatePendingScheduleActions } from "./schedule-isolation.ts";
import {
  DEFAULT_TURN_FLAGS,
  type AgentTurnFlags,
} from "./turn-flags.ts";
import { normalizeExactText, findRelatedOpenTask, findRelatedOpenTasks } from "../task-identity.ts";
import { resolveMentionedJerusalemDate } from "../schedule-query.ts";
import { productNow } from "../product-clock.ts";
import { todayContext } from "../time.ts";

/**
 * When the user clearly asks to buy something and the model returned no shopping
 * action (asked for quantity/confirmation instead), synthesize shopping.add.
 * Pattern is structural ("לקנות …"), not product-specific keywords.
 * Multi-item phrases emit one add per short title.
 */
export function ensureClearShoppingAdd(input: {
  actions: AgentAction[];
  userMessage?: string | null;
}): AgentAction[] {
  if (input.actions.some((action) => action.type.startsWith("shopping."))) {
    return input.actions;
  }
  const message = (input.userMessage ?? "").trim();
  if (!message) return input.actions;
  if (isShoppingQueryOnly(message)) return input.actions;
  const titles = extractShoppingAddTitles(message);
  if (!titles.length) return input.actions;
  const blank = {
    id: null as string | null,
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
    quantity: 1,
  };
  return [
    ...input.actions,
    ...titles.map((title) => ({
      type: "shopping.add" as const,
      ...blank,
      title,
    })),
  ];
}

function isShoppingQueryOnly(message: string): boolean {
  return /מה\s+(?:חסר|נשאר|יש)|מה\s+בקניות|תרא[הי]\s+את\s+ה(?:רשימה|קניות)|מה\s+לקנות/.test(
    message,
  );
}

function splitShoppingListChunk(chunk: string): string[] {
  return chunk
    .split(/\s*(?:,|\s+ו)\s*/u)
    .map((part) => part.trim())
    .map((part) => part.replace(/^ו/u, "").trim())
    .map((part) =>
      part
        .replace(/^(?:גם|עוד|בבקשה)\s+/u, "")
        .replace(/^(?:לקנות|קנו|קניתי|נגמר|צריך)\s+/u, "")
        .trim(),
    )
    .map((part) => part.slice(0, 80))
    .filter((part) => part.length >= 2 && part.length <= 40);
}

export function extractShoppingAddTitles(message: string): string[] {
  // Purchase/cancel/complete speech must not invent new shopping entities.
  if (
    /קניתי|קנה|קנתה|הזמנתי|לא\s+צריך|קיבלתי|תוריד|סיימתי/.test(message) &&
    !/(?:נגמר|צרי(?:ך|כה)|תוסיפ)/.test(message)
  ) {
    return [];
  }
  const ranOut = message.match(/(?:^|[\s,])נגמר\s+(.+?)(?:[.!?]|$)/u);
  if (ranOut?.[1]) {
    return splitShoppingListChunk(ranOut[1]).filter((t) => t.length <= 40);
  }
  const match =
    message.match(
      /(?:^|[\s,])(?:אני\s+)?צריכ[הא]\s+לקנות\s+(.+?)(?:[.!?]|$)/u,
    ) ||
    message.match(/(?:^|[\s,])לקנות\s+(.+?)(?:[.!?]|$)/u) ||
    message.match(/תוסיפ[ויי]?\s+(?:גם\s+)?(.+?)\s+לרשימת\s+הקניות/u) ||
    message.match(/תוסיפ[ויי]?\s+(?:גם\s+)?(.+?)\s+לקניות/u) ||
    message.match(/תוסיפ[ויי]?\s+(?:גם\s+)?(.+?)(?:\s+אם\s+אין)?(?:[.!?]|$)/u) ||
    message.match(/(?:^|[\s,])צרי(?:ך|כה|כ)\s+(?!לקנות)(.+?)(?:[.!?]|$)/u);
  if (!match?.[1]) return [];
  // Reject task-shaped "צריך לקבוע/לשלם/לבדוק…"
  const chunk = match[1].trim();
  if (/^(?:ל|ו)?(?:קבוע|שלם|בדוק|היה|זכור|קח|סדר|הזמין)/u.test(chunk)) {
    return [];
  }
  if (/^(?:לקבוע|לשלם|לבדוק|להיות|לזכור|לקחת|לסדר|להזמין)/u.test(chunk)) {
    return [];
  }
  return splitShoppingListChunk(chunk).filter(
    (t) => t.length >= 2 && t.length <= 40,
  );
}

/** Purchase / cancel utterances: mark existing shopping items purchased or remove. */
export function ensureShoppingPurchaseOrCancel(input: {
  actions: AgentAction[];
  shopping: ShoppingItem[];
  userMessage?: string | null;
}): AgentAction[] {
  const message = (input.userMessage ?? "").trim();
  if (!message) return input.actions;
  if (isShoppingQueryOnly(message)) {
    return input.actions.filter(
      (action) => !String(action.type).startsWith("shopping."),
    );
  }
  const cancel =
    /לא\s+צריך|קיבלתי|אין\s+צורך/.test(message) &&
    !/קניתי|קנה|קנתה/.test(message);
  const purchase = /קניתי|קנה|קנתה|הזמנתי/.test(message);
  if (!cancel && !purchase) return input.actions;

  const open = input.shopping.filter((item) => !item.purchased_at);
  const hits = open.filter((item) => {
    const key = normalizeExactText(item.title).toLowerCase();
    return (
      key.length >= 2 &&
      normalizeExactText(message).toLowerCase().includes(key)
    );
  });
  if (!hits.length) return input.actions;

  const withoutShop = input.actions.filter(
    (action) => !String(action.type).startsWith("shopping."),
  );
  const blank = {
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
  };
  if (cancel) {
    return [
      ...withoutShop,
      ...hits.map((item) => ({
        type: "shopping.remove" as const,
        id: item.id,
        title: item.title,
        ...blank,
      })),
    ];
  }
  return [
    ...withoutShop,
    ...hits.map((item) => ({
      type: "shopping.toggle" as const,
      id: item.id,
      title: item.title,
      purchased: true,
      ...blank,
    })),
  ];
}

/**
 * One-day / event-scoped utterances must not land as durable preference memory.
 * Keep conversation corrections in chat; only allow temporary exception writes.
 */
export function constrainMemoryWritesForDurability(input: {
  actions: AgentAction[];
  userMessage?: string | null;
}): AgentAction[] {
  const message = (input.userMessage ?? "").trim();
  const ephemeralTurn =
    /(?:^|[\s,])(?:מחר|היום|הערב|הלילה|השבוע|כרגע|הפעם)|רק\s+מה\s+שחייב|אל\s+תעמיס|נשאר\s+איתי|לא\s+מרגיש|חוזר\s+היום|עזבי|לא\s+מבשל/.test(
      message,
    );
  const durableRoutine =
    /בימי\s+\S+|כל\s+(?:יום|בוקר|ערב|שבוע)|תמיד|בדרך\s+כלל|אני\s+לא\s+אוהב|אני\s+לא\s+אוהבת/.test(
      message,
    );
  return input.actions.flatMap((action) => {
    if (action.type !== "memory.upsert") return [action];
    const content = action.content ?? "";
    const looksTemporary =
      (!durableRoutine && ephemeralTurn) ||
      /(?:^|[\s,"״])(?:מחר|היום|הערב|הלילה|השבוע|כרגע|הפעם)|רק\s+היום|חריג|זמנית|בפעם\s+הזו|אל\s+תעמיס|לא\s+מבשל/.test(
        content,
      );
    if (!looksTemporary) return [action];
    // Drop silent agent durable guesses for ephemeral turns.
    if (action.silent === true && action.kind === "preference") return [];
    // Day-scoped lifestyle notes belong in conversation context, not durable memory.
    if (
      ephemeralTurn &&
      !durableRoutine &&
      !/תום|דני|מאיה|עידו|צ׳ארלי|צארלי|חשמלאי/.test(content + message)
    ) {
      return [];
    }
    return [
      {
        ...action,
        kind: "fact" as const,
      },
    ];
  });
}

const HEBREW_CLOCK: Array<{ re: RegExp; time: string }> = [
  { re: /ל?שש(?:\s|$)/, time: "18:00" },
  { re: /ל?חמש(?:\s|$)/, time: "17:00" },
  { re: /ל?ארבע(?:\s|$)/, time: "16:00" },
  { re: /ל?שבע(?:\s|$)/, time: "19:00" },
  { re: /ל?שמונה(?:\s|$)/, time: "20:00" },
  { re: /ל?תשע(?:\s|$)/, time: "21:00" },
];

function extractClockTime(message: string): string | null {
  const numeric = message.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  if (numeric) {
    return `${numeric[1]!.padStart(2, "0")}:${numeric[2]}`;
  }
  for (const row of HEBREW_CLOCK) {
    if (row.re.test(message)) return row.time;
  }
  return null;
}

/** Strip schedule verbs/times so entity matching can bind "הרופא" → רופא ילדים. */
function scheduleEntityHint(message: string): string {
  return message
    .replace(/מחר|היום|אתמול/g, " ")
    .replace(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g, " ")
    .replace(/ל?שש|ל?חמש|ל?ארבע|ל?שבע|ל?שמונה|ל?תשע/g, " ")
    .replace(/תעביר[יוה]?|העבר[יוה]?|תזיז[יוה]?|תעדכנ[יוה]?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findScheduleTask(
  openTasks: TaskRow[],
  message: string,
): TaskRow | null {
  const hint = scheduleEntityHint(message);
  return (
    (hint ? findRelatedOpenTask(openTasks, hint) : null) ??
    (hint
      ? findRelatedOpenTasks(openTasks, hint, { completion: true })[0]
      : null) ??
    findRelatedOpenTask(openTasks, message) ??
    findRelatedOpenTasks(openTasks, message, { completion: true })[0] ??
    null
  );
}

/**
 * Timed schedule utterances must land on day_plan even when the model only
 * acknowledges an existing due ("כבר מתוכנן") with zero mutations, or wrongly
 * emits task.complete on a move ("תעבירי … לשש").
 */
export function ensureDayPlanFromScheduleUtterance(input: {
  actions: AgentAction[];
  openTasks: TaskRow[];
  userMessage?: string | null;
  now?: Date;
}): AgentAction[] {
  const message = (input.userMessage ?? "").trim();
  if (!message) return input.actions;
  const time = extractClockTime(message);
  if (!time) return input.actions;
  const now = input.now ?? productNow();
  const today = todayContext(now).date;
  const match = findScheduleTask(input.openTasks, message);
  if (input.actions.some((action) => action.plan_patch === "set")) {
    return input.actions;
  }
  const date =
    resolveMentionedJerusalemDate(message, now) ?? match?.due_on ?? today;

  const withoutMistakenComplete = input.actions.filter(
    (action) =>
      !(
        match &&
        action.type === "task.complete" &&
        (action.id === match.id ||
          (action.title != null &&
            normalizeExactText(action.title).includes(
              normalizeExactText(match.title).slice(0, 4),
            )))
      ),
  );

  let attached = false;
  const withPlan = withoutMistakenComplete.map((action) => {
    if (attached) return action;
    if (
      action.type !== "task.update" &&
      action.type !== "task.create" &&
      action.type !== "task.reschedule"
    ) {
      return action;
    }
    attached = true;
    const dueOn = action.due_on?.trim() || date;
    const dueTime = action.due_time?.trim() || time;
    return {
      ...action,
      id: action.id ?? match?.id ?? null,
      title: action.title ?? match?.title ?? action.title,
      due_on: dueOn,
      due_time: dueTime,
      due_patch: "set" as const,
      plan_patch: "set" as const,
      planned_date: dueOn,
      planned_start_time: dueTime,
      planned_end_time: action.planned_end_time ?? null,
    };
  });
  if (attached) return withPlan;
  if (!match) return input.actions;
  return [
    ...withoutMistakenComplete,
    {
      type: "task.update",
      id: match.id,
      title: match.title,
      notes: null,
      due_on: date,
      due_time: time,
      due_patch: "set",
      reminder_enabled: null,
      reminder_at: null,
      reminder_at_patch: null,
      reminder_offset_minutes: null,
      reminder_patch: null,
      plan_patch: "set",
      planned_date: date,
      planned_start_time: time,
      planned_end_time: null,
      kind: null,
      content: null,
      confidence: null,
      silent: null,
    },
  ];
}

function mentionsFollowupTitle(
  userMessage: string | null | undefined,
  followupTitle: string,
): boolean {
  const message = normalizeExactText(userMessage ?? "").toLowerCase();
  const follow = normalizeExactText(followupTitle).toLowerCase();
  if (!message || !follow) return false;
  if (message.includes(follow)) return true;
  const tokens = follow
    .replace(/(^|\s)את(\s|$)/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2)
    .map((token) =>
      token.length > 2 && token.startsWith("ה") ? token.slice(1) : token,
    );
  return tokens.length > 0 && tokens.every((token) => message.includes(token));
}

/**
 * Model sometimes sets suppress_learned_followups on ordinary turns.
 * Only keep suppress when the user message references a known follow-up.
 */
export function resolveSuppressFlags(input: {
  turnFlags: AgentTurnFlags;
  userMessage?: string | null;
  relations: Array<{ followupTitle: string }>;
}): AgentTurnFlags {
  if (!input.turnFlags.suppress_learned_followups) return input.turnFlags;
  const grounded = input.relations.some((relation) =>
    mentionsFollowupTitle(input.userMessage, relation.followupTitle),
  );
  if (grounded) return input.turnFlags;
  return {
    ...input.turnFlags,
    suppress_learned_followups: false,
  };
}

/**
 * Prepare the final executable action list for a turn.
 * Must be persisted into agent_turns.decision BEFORE execute_lean_action_idempotent,
 * because the RPC authorizes by exact match against stored decision.actions[index].
 */
export function prepareExecutableActions(input: {
  actions: AgentAction[];
  openTasks: TaskRow[];
  shopping?: ShoppingItem[];
  memories?: MemoryRow[];
  turnFlags?: AgentTurnFlags;
  pendingSchedule?: Extract<
    ClientPresentation,
    { type: "schedule_plan" }
  > | null;
  allTasks?: TaskRow[];
  userMessage?: string | null;
  proposalActions?: AgentAction[] | null;
}): AgentAction[] {
  const turnFlags = input.turnFlags ?? DEFAULT_TURN_FLAGS;
  const relations = selectLearnedActionRelations(input.memories ?? []).map(
    (row) => ({
      trigger: row.trigger,
      followupTitle: row.followupTitle,
      ordering: row.ordering,
    }),
  );
  // Honor one-shot suppress only when the user message references a known
  // follow-up title (relation-driven). Prevents misfired suppress on ordinary turns.
  const effectiveFlags = resolveSuppressFlags({
    turnFlags,
    userMessage: input.userMessage,
    relations,
  });

  let prepared = ensureRelationUpsertAction({
    actions: input.actions,
    userMessage: input.userMessage,
    proposalActions: input.proposalActions,
  });
  prepared = normalizeMemoryRelationActions(prepared);
  prepared = filterMemoryWritesForException({
    actions: prepared,
    turnFlags: effectiveFlags,
    userMessage: input.userMessage,
  });
  prepared = expandLearnedFollowUps({
    actions: prepared,
    relations,
    openTasks: input.openTasks,
    turnFlags: effectiveFlags,
  });
  prepared = filterFollowupCreatesForException({
    actions: prepared,
    relations,
    turnFlags: effectiveFlags,
  });
  prepared = ensureClearShoppingAdd({
    actions: prepared,
    userMessage: input.userMessage,
  });
  prepared = reconcileActions({
    actions: prepared,
    openTasks: input.openTasks,
    shopping: input.shopping ?? [],
    userMessage: input.userMessage ?? undefined,
  });
  prepared = ensureShoppingPurchaseOrCancel({
    actions: prepared,
    shopping: input.shopping ?? [],
    userMessage: input.userMessage,
  });
  prepared = ensureDayPlanFromScheduleUtterance({
    actions: prepared,
    openTasks: input.openTasks,
    userMessage: input.userMessage,
  });
  prepared = constrainMemoryWritesForDurability({
    actions: prepared,
    userMessage: input.userMessage,
  });
  const isolated = isolatePendingScheduleActions({
    actions: prepared,
    pendingSchedule: input.pendingSchedule ?? null,
    tasks: input.allTasks ?? input.openTasks,
  });
  return isolated.actions;
}
