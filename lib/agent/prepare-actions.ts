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
import { normalizeExactText } from "../task-identity.ts";

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
  prepared = reconcileActions({
    actions: prepared,
    openTasks: input.openTasks,
    shopping: input.shopping ?? [],
  });
  const isolated = isolatePendingScheduleActions({
    actions: prepared,
    pendingSchedule: input.pendingSchedule ?? null,
    tasks: input.allTasks ?? input.openTasks,
  });
  return isolated.actions;
}
