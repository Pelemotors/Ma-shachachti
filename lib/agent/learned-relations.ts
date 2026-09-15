import type { MemoryRow } from "../types.ts";

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
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (parsed.kind !== RELATION_KIND) return null;
    if (parsed.active === false) return null;
    const trigger = typeof parsed.trigger === "string" ? parsed.trigger.trim() : "";
    const followup =
      typeof parsed.followup === "string" ? parsed.followup.trim() : "";
    if (!trigger || !followup) return null;
    const ordering = parsed.ordering === "with" ? "with" : "after";
    return {
      trigger,
      followupTitle: followup,
      ordering,
      scope: "always",
      active: true,
    };
  } catch {
    return null;
  }
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
