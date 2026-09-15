/**
 * Internal failure taxonomy for agent turns.
 * Never print these codes/diagnostics directly to users.
 */

export const AGENT_FAILURE_CATEGORIES = [
  "timeout",
  "transport",
  "empty_output",
  "invalid_json",
  "schema_violation",
  "invalid_insights",
  "persistence_failure",
  "rate_limited",
  "unknown",
] as const;

export type AgentFailureCategory = (typeof AGENT_FAILURE_CATEGORIES)[number];

export type AgentFailureLog = {
  category: AgentFailureCategory;
  turnId?: string;
  mode?: string;
  latencyMs?: number;
  retryCount?: number;
  model?: string;
  reason?: string;
};

export function classifyAgentError(error: unknown): AgentFailureCategory {
  if (!error) return "unknown";
  if (error instanceof Error) {
    const name = error.name.toLowerCase();
    const message = error.message.toLowerCase();
    if (
      name === "timeouterror" ||
      name === "aborterror" ||
      message.includes("timeout") ||
      message.includes("aborted")
    ) {
      return "timeout";
    }
    if (message === "rate_limited") return "rate_limited";
    if (message === "invalid_output") return "schema_violation";
    if (message === "upstream_error") return "transport";
    if (message.includes("json")) return "invalid_json";
    if (message.includes("persist") || message.includes("save")) {
      return "persistence_failure";
    }
  }
  return "unknown";
}

/** Safe structured log — no prompts/secrets. */
export function logAgentFailure(entry: AgentFailureLog) {
  console.error("agent_failure", {
    category: entry.category,
    turnId: entry.turnId ?? null,
    mode: entry.mode ?? null,
    latencyMs: entry.latencyMs ?? null,
    retryCount: entry.retryCount ?? null,
    model: entry.model ?? null,
    reason: entry.reason ? String(entry.reason).slice(0, 160) : null,
  });
}
