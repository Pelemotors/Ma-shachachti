import type {
  AgentWorkingMemory,
  AgentWorkingMemoryPatch,
  PendingAgentIntent,
} from "@/lib/model";

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

const STALE_MS = 7 * 24 * 3600_000;

export function emptyWorkingMemory(now = new Date()): AgentWorkingMemory {
  return {
    objective: null,
    contextSummary: null,
    openLoops: [],
    lastAgentQuestion: null,
    relevantEntityIds: [],
    assumptions: [],
    updatedAt: now.toISOString(),
  };
}

function collectUuids(value: unknown, into: Set<string>, depth = 0) {
  if (depth > 6 || value == null) return;
  if (typeof value === "string") {
    const m = value.match(UUID_RE);
    if (m) for (const id of m) into.add(id.toLowerCase());
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUuids(item, into, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>))
      collectUuids(v, into, depth + 1);
  }
}

/** Preserve what was open — never invent objective from legacy intent.type. */
export function migratePendingIntentToWorkingMemory(
  pending: NonNullable<PendingAgentIntent>,
  now = new Date(),
): AgentWorkingMemory {
  const ids = new Set<string>();
  if (pending.contextTaskId) ids.add(pending.contextTaskId);
  collectUuids(pending.draftActions, ids);
  const relevantEntityIds = [...ids].slice(0, 40);
  const question = pending.clarificationQuestion?.trim() || null;

  return {
    objective: "להשלים את הבקשה שעליה נשאלה שאלת ההמשך",
    contextSummary: question
      ? `שאלה פתוחה מהסוכן: ${question}`
      : "יש המשך שיחה פתוח מהתור הקודם",
    openLoops: [
      {
        summary: question
          ? "ממתינים לתשובת המשתמש לשאלה האחרונה כדי להמשיך"
          : "יש נושא פתוח מהשיחה הקודמת",
        relevantEntityIds,
      },
    ],
    lastAgentQuestion: question,
    relevantEntityIds,
    assumptions: [],
    updatedAt: now.toISOString(),
  };
}

export function applyWorkingMemoryPatch(
  current: AgentWorkingMemory | null | undefined,
  patch: AgentWorkingMemoryPatch,
  now = new Date(),
): AgentWorkingMemory {
  const base = current ?? emptyWorkingMemory(now);
  const next: AgentWorkingMemory = {
    objective: base.objective,
    contextSummary: base.contextSummary,
    openLoops: [...base.openLoops],
    lastAgentQuestion: base.lastAgentQuestion,
    relevantEntityIds: [...base.relevantEntityIds],
    assumptions: [...base.assumptions],
    updatedAt: now.toISOString(),
  };

  if (Object.prototype.hasOwnProperty.call(patch, "objective"))
    next.objective = patch.objective ?? null;
  if (Object.prototype.hasOwnProperty.call(patch, "contextSummary"))
    next.contextSummary = patch.contextSummary ?? null;
  if (Object.prototype.hasOwnProperty.call(patch, "lastAgentQuestion"))
    next.lastAgentQuestion = patch.lastAgentQuestion ?? null;
  if (Object.prototype.hasOwnProperty.call(patch, "openLoops"))
    next.openLoops = (patch.openLoops ?? []).slice(0, 8);
  if (Object.prototype.hasOwnProperty.call(patch, "relevantEntityIds"))
    next.relevantEntityIds = (patch.relevantEntityIds ?? []).slice(0, 40);
  if (Object.prototype.hasOwnProperty.call(patch, "assumptions"))
    next.assumptions = (patch.assumptions ?? []).slice(0, 12);

  return next;
}

/** Drop extremely stale working memory (deterministic safeguard, not intent FSM). */
export function sanitizeWorkingMemory(
  memory: AgentWorkingMemory | null | undefined,
  now = new Date(),
): AgentWorkingMemory | null {
  if (!memory) return null;
  const at = Date.parse(memory.updatedAt);
  if (!Number.isFinite(at) || now.getTime() - at > STALE_MS) return null;
  return {
    ...memory,
    openLoops: memory.openLoops.slice(0, 8),
    relevantEntityIds: memory.relevantEntityIds.slice(0, 40),
    assumptions: memory.assumptions.slice(0, 12),
  };
}
