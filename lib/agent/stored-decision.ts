import { parseDecision } from "../action-schema.ts";
import { recoverSafeReply } from "./openai-orchestrator.ts";
import type { StoredTurnDecision } from "./turn-receipts.ts";

export function storeValidatedDecision(input: {
  decision: unknown;
  recoveredReply: string | null;
  attempts: number;
}): StoredTurnDecision {
  if (input.decision) {
    return {
      kind: "decision",
      value: input.decision,
      attempts: input.attempts,
    };
  }
  if (!input.recoveredReply) throw new Error("missing_recovered_reply");
  return {
    kind: "recovered_reply",
    value: input.recoveredReply,
    attempts: input.attempts,
  };
}

export function parseStoredDecision(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const stored = value as {
    kind?: unknown;
    value?: unknown;
    attempts?: unknown;
  };
  const attempts =
    typeof stored.attempts === "number" && stored.attempts >= 1
      ? stored.attempts
      : 1;
  if (stored.kind === "decision") {
    const parsed = parseDecision(JSON.stringify(stored.value));
    if (!parsed.ok) return null;
    return {
      decision: parsed,
      recoveredReply: null,
      attempts,
    };
  }
  if (stored.kind === "recovered_reply" && typeof stored.value === "string") {
    const reply = recoverSafeReply(stored.value);
    if (!reply) return null;
    return {
      decision: null,
      recoveredReply: reply,
      attempts,
    };
  }
  return null;
}
