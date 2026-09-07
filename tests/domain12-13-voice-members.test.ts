import test from "node:test";
import assert from "node:assert/strict";
import { emptyState } from "../lib/model";
import {
  groundInterpretations,
  resolveMemberIds,
  type SemanticInterpretation,
} from "../lib/agent/semantic";

const now = new Date("2026-09-08T10:00:00.000+03:00");

test("domain12/13: voice/text share member grounding from structured hints", () => {
  const memberId = crypto.randomUUID();
  const s = {
    ...emptyState(),
    members: [
      {
        id: memberId,
        name: "פלא",
        type: "child" as const,
        aliases: [] as string[],
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    ],
  };
  assert.deepEqual(resolveMemberIds(s, [], ["פלא"]).resolved, [memberId]);
  const interp: SemanticInterpretation = {
    intent: "create_task",
    targetEntityType: "task",
    targetId: null,
    candidateIds: [],
    entityHint: "תור לרופא",
    temporal: "future",
    relatedMemberIds: [],
    relatedMemberHints: ["פלא"],
    factKind: null,
    persistence: "none",
    confidence: 0.9,
    ambiguity: false,
    needsClarification: false,
    clarificationQuestion: null,
    payload: { title: "תור לרופא לפלא", kind: "task" },
    evidence: null,
  };
  const grounded = groundInterpretations(s, [interp], now);
  const create = grounded.actions.find((a) => a.type === "task.create");
  assert.ok(
    create &&
      create.type === "task.create" &&
      create.task.relatedMemberIds?.includes(memberId),
  );
});
