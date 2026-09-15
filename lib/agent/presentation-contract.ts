/**
 * Presentation contract: separate factual confirmation from conversational talk.
 * Diagnostics / chain-of-thought must never reach the user through this path.
 */

import type { ActionResult } from "../types.ts";

export type PresentationDecision = {
  /** What the user should see */
  userReply: string;
  /** Kept for telemetry/tests — never send to client as primary reply */
  suppressedTalk: string | null;
  mode: "facts_only" | "conversation" | "clarification" | "empty_guard";
};

function hasVisibleSuccess(results: ActionResult[]) {
  return results.some((result) => {
    if (!result.ok) return true; // failures are visible facts
    if ("silent" in result && result.silent) return false;
    return true;
  });
}

function hasSuccessfulMutation(results: ActionResult[]) {
  return results.some((result) => {
    if (!result.ok) return false;
    if ("silent" in result && result.silent) return false;
    return true;
  });
}

/**
 * After successful visible mutations, default to confirmation facts only.
 * Conversation without mutations keeps natural talk.
 * Failures surface as facts (error lines) without LLM claim text.
 */
export function applyPresentationContract(input: {
  facts: string;
  talk: string;
  results: ActionResult[];
  llmReply: string;
  claimsExecution: (text: string) => boolean;
}): PresentationDecision {
  const facts = input.facts.trim();
  const talk = input.talk.trim();

  if (hasSuccessfulMutation(input.results) && facts) {
    return {
      userReply: facts,
      suppressedTalk: talk || null,
      mode: "facts_only",
    };
  }

  if (facts && !hasSuccessfulMutation(input.results)) {
    // Failures / rejections — show facts, drop execution-claim talk
    return {
      userReply: facts,
      suppressedTalk: talk || null,
      mode: "clarification",
    };
  }

  if (talk) {
    return {
      userReply: talk,
      suppressedTalk: null,
      mode: "conversation",
    };
  }

  if (input.claimsExecution(input.llmReply)) {
    return {
      userReply: "לא בוצעה פעולה במערכת.",
      suppressedTalk: null,
      mode: "empty_guard",
    };
  }

  const raw = input.llmReply.trim();
  if (raw) {
    return {
      userReply: raw,
      suppressedTalk: null,
      mode: "conversation",
    };
  }

  if (hasVisibleSuccess(input.results) && facts) {
    return {
      userReply: facts,
      suppressedTalk: null,
      mode: "facts_only",
    };
  }

  return {
    userReply: "",
    suppressedTalk: null,
    mode: "empty_guard",
  };
}
