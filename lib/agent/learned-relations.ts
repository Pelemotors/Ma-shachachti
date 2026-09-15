import type { AgentAction, MemoryRow } from "../types.ts";

/**
 * Structured learned action relations stored in Memory content (no new DB kind).
 * Format (JSON):
 * {
 *   "v": 1,
 *   "kind": "action_followup",
 *   "trigger": "primary intent text",
 *   "followup": "follow-up task title",
 *   "ordering": "after",
 *   "scope": "always",
 *   "active": true
 * }
 *
 * Free-text memories are ignored by the expander (agent still sees them in context).
 */

export type LearnedActionRelation = {
  memoryId: string;
  trigger: string;
  followupTitle: string;
  ordering: "after" | "with";
  scope: "always";
  active: boolean;
  confidence: MemoryRow["confidence"];
  source: MemoryRow["source"];
};

const RELATION_KIND = "action_followup";

export function encodeActionFollowupRelation(input: {
  trigger: string;
  followup: string;
  ordering?: "after" | "with";
}): string {
  return JSON.stringify({
    v: 1,
    kind: RELATION_KIND,
    trigger: input.trigger.trim().slice(0, 200),
    followup: input.followup.trim().slice(0, 200),
    ordering: input.ordering ?? "after",
    scope: "always",
    active: true,
  });
}

export function parseActionFollowupRelation(
  content: string,
): Omit<LearnedActionRelation, "memoryId" | "confidence" | "source"> | null {
  const trimmed = content.trim();
  const candidates = [trimmed];
  // Repair: extract embedded JSON object if the model wrapped it in prose.
  const embedded = trimmed.match(/\{[\s\S]*"kind"\s*:\s*"action_followup"[\s\S]*\}/);
  if (embedded?.[0] && embedded[0] !== trimmed) {
    candidates.push(embedded[0]);
  }
  for (const candidate of candidates) {
    if (!candidate.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      if (parsed.kind !== RELATION_KIND) continue;
      if (parsed.active === false) continue;
      const trigger =
        typeof parsed.trigger === "string" ? parsed.trigger.trim() : "";
      const followup =
        typeof parsed.followup === "string" ? parsed.followup.trim() : "";
      if (!trigger || !followup) continue;
      const ordering = parsed.ordering === "with" ? "with" : "after";
      return {
        trigger,
        followupTitle: followup,
        ordering,
        scope: "always",
        active: true,
      };
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

/**
 * Normalize memory.upsert actions so learned relations are stored as compact JSON.
 * Free-text that does not embed action_followup JSON is left unchanged.
 */
export function normalizeMemoryRelationActions(
  actions: AgentAction[],
): AgentAction[] {
  return actions.map((action) => {
    if (action.type !== "memory.upsert" || !action.content) return action;
    const parsed = parseActionFollowupRelation(action.content);
    if (!parsed) return action;
    return {
      ...action,
      kind: action.kind ?? "fact",
      content: encodeActionFollowupRelation({
        trigger: parsed.trigger,
        followup: parsed.followupTitle,
        ordering: parsed.ordering,
      }),
    };
  });
}

export function selectLearnedActionRelations(
  memories: MemoryRow[],
): LearnedActionRelation[] {
  const out: LearnedActionRelation[] = [];
  for (const memory of memories) {
    const parsed = parseActionFollowupRelation(memory.content);
    if (!parsed || !parsed.active) continue;
    out.push({
      memoryId: memory.id,
      ...parsed,
      confidence: memory.confidence,
      source: memory.source,
    });
  }
  return out;
}

/**
 * When the model parked a structured action_followup memory write inside
 * proposal (instead of actions), promote it — learning writes should not
 * require an approve step.
 */
export function promoteRelationWritesFromProposal(input: {
  actions: AgentAction[];
  proposalActions?: AgentAction[] | null;
}): { actions: AgentAction[]; promoted: number } {
  const fromProposal = (input.proposalActions ?? []).filter((action) => {
    if (action.type !== "memory.upsert" || !action.content) return false;
    return Boolean(parseActionFollowupRelation(action.content));
  });
  if (!fromProposal.length) {
    return { actions: input.actions, promoted: 0 };
  }
  const already = input.actions.some((action) => {
    if (action.type !== "memory.upsert" || !action.content) return false;
    return Boolean(parseActionFollowupRelation(action.content));
  });
  if (already) return { actions: input.actions, promoted: 0 };
  return {
    actions: [...input.actions, ...fromProposal],
    promoted: fromProposal.length,
  };
}

/**
 * When the user explicitly requests an action_followup save but the model
 * returned talk without memory.upsert, synthesize the structured write.
 * Activates only if the user message literally mentions action_followup
 * (contractual save request) — no domain keyword lists.
 */
export function ensureRelationUpsertAction(input: {
  actions: AgentAction[];
  userMessage?: string | null;
  proposalActions?: AgentAction[] | null;
}): AgentAction[] {
  const promoted = promoteRelationWritesFromProposal({
    actions: input.actions,
    proposalActions: input.proposalActions,
  });
  let actions = promoted.actions;

  const message = (input.userMessage ?? "").trim();
  if (!message) return actions;
  if (!/action_followup/i.test(message)) return actions;

  const already = actions.some((action) => {
    if (action.type !== "memory.upsert" || !action.content) return false;
    return Boolean(parseActionFollowupRelation(action.content));
  });
  if (already) return actions;

  const inferred = inferTriggerFollowupFromTeachingMessage(message);
  if (!inferred) return actions;

  const blank: AgentAction = {
    type: "memory.upsert",
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
    kind: "preference",
    content: encodeActionFollowupRelation(inferred),
    confidence: "high",
    silent: true,
  };
  return [...actions, blank];
}

/**
 * Structural teaching extractors — connectors only, no chore/domain vocabulary.
 */
export function inferTriggerFollowupFromTeachingMessage(
  message: string,
): { trigger: string; followup: string } | null {
  const cleaned = message
    .replace(/שמרי?\s*כ[־\-]?action_followup\s*JSON\.?/gi, "")
    .replace(/action_followup/gi, "")
    .trim();

  const patterns = [
    /כש(?:אני\s+)?אומר(?:ת)?\s+(.+?)\s+תוסיף(?:י)?\s+אחריו\s+(.+?)(?:\.|$)/u,
    /כש(?:אני\s+)?אומר(?:ת)?\s+(.+?)\s+יש\s+גם\s+(.+?)(?:\.|$)/u,
    /כש(?:אני\s+)?אומר(?:ת)?\s+(.+?)\s+אז\s+גם\s+(.+?)(?:\.|$)/u,
    /when\s+I\s+say\s+(.+?)\s+also\s+(?:add\s+)?(.+?)(?:\.|$)/i,
  ];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (!match?.[1] || !match[2]) continue;
    const trigger = match[1].trim().replace(/^["«]|["»]$/g, "");
    const followup = match[2].trim().replace(/^["«]|["»]$/g, "");
    if (trigger.length >= 2 && followup.length >= 2) {
      return { trigger, followup };
    }
  }
  return null;
}

/** Render relations into compact context for the agent (Decision layer). */
export function renderLearnedRelationsBlock(
  relations: LearnedActionRelation[],
): string {
  if (!relations.length) return "";
  const lines = relations.map(
    (row) =>
      `- relation ${row.memoryId}: when "${row.trigger}" → follow-up task "${row.followupTitle}" (${row.ordering}); explicit current instruction overrides; one-shot exception skips follow-up`,
  );
  return `## Learned action relations\n${lines.join("\n")}`;
}
