/**
 * Turn-level policy flags from the agent decision.
 * Used instead of keyword/regex rule engines for one-shot exceptions.
 */
export type AgentTurnFlags = {
  /**
   * When true: do not expand learned follow-up relations this turn,
   * and do not persist standing preference/relation memory unless
   * standing_rule_change is also true.
   */
  suppress_learned_followups: boolean;
  /**
   * Explicit user request to change the standing general rule/preference.
   * One-shot exceptions must keep this false.
   */
  standing_rule_change: boolean;
};

export const DEFAULT_TURN_FLAGS: AgentTurnFlags = {
  suppress_learned_followups: false,
  standing_rule_change: false,
};

export function parseTurnFlags(raw: unknown): AgentTurnFlags {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_TURN_FLAGS };
  }
  const row = raw as Record<string, unknown>;
  return {
    suppress_learned_followups: row.suppress_learned_followups === true,
    standing_rule_change: row.standing_rule_change === true,
  };
}
