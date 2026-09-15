import assert from "node:assert/strict";
import { test } from "node:test";
import { composeReply } from "../lib/action-schema.ts";
import { applyPresentationContract } from "../lib/agent/presentation-contract.ts";

test("shopping.add success → one concise confirmation", () => {
  const reply = composeReply(
    "הוספתי חלב לרשימת הקניות.\nמעולה, שמרתי את זה עבורך ואם תרצי אוסיף עוד.",
    [{ ok: true, type: "shopping.add", title: "חלב" }],
  );
  assert.match(reply, /הוספתי.*חלב|חלב/);
  assert.equal(reply.includes("\n"), false);
  assert.doesNotMatch(reply, /מעולה|עבורך|אוסיף עוד/);
});

test("task.create success suppresses long LLM talk", () => {
  const reply = composeReply(
    "שמרתי. רוצה גם שאתזמן תזכורת? אפשר גם לסדר את שאר היום.",
    [{ ok: true, type: "task.create", title: "לקחת תרופה", due_on: "2026-09-16" }],
  );
  assert.match(reply, /שמרתי את המשימה/);
  assert.doesNotMatch(reply, /תזכורת|שאר היום/);
});

test("conversation without mutation keeps natural reply", () => {
  const reply = composeReply("אפשר לספר לי מה פתוח אצלך.", []);
  assert.equal(reply, "אפשר לספר לי מה פתוח אצלך.");
});

test("clarification without success is not a fake confirmation", () => {
  const decision = applyPresentationContract({
    facts: "",
    talk: "לאיזה תאריך לשים את זה?",
    results: [],
    llmReply: "לאיזה תאריך לשים את זה?",
    claimsExecution: () => false,
  });
  assert.equal(decision.mode, "conversation");
  assert.equal(decision.userReply, "לאיזה תאריך לשים את זה?");
});
