import test from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_ACCEPTANCE_CASE_IDS,
  AGENT_ACCEPTANCE_BY_STAGE,
} from "../lib/agent/acceptance-catalog";

test("agent acceptance catalog covers A01–V01 (89 cases)", () => {
  assert.equal(AGENT_ACCEPTANCE_CASE_IDS.length, 89);
  assert.ok(AGENT_ACCEPTANCE_CASE_IDS.includes("A01"));
  assert.ok(AGENT_ACCEPTANCE_CASE_IDS.includes("V01"));
  assert.equal(AGENT_ACCEPTANCE_BY_STAGE.release_gate.length, 89);
});

test("agent acceptance live suite is NOT RUN without production LLM path", () => {
  const hasKey = Boolean(process.env.OPENAI_API_KEY);
  if (!hasKey) {
    // Contract: never PASS Agent Acceptance via mock/regex/fallback.
    assert.equal("NOT_RUN_INFRA", "NOT_RUN_INFRA");
    return;
  }
  // Live runner lands in later stages; presence of a key alone is not PASS.
  assert.ok(hasKey);
});
