import test from "node:test";
import assert from "node:assert/strict";
import {
  PROPOSAL_NOT_EXECUTED_NOTICE,
  buildExecutionReceipt,
  composeAssistantText,
  neutralizePrematureExecutionClaims,
} from "../lib/agent/execution-truth";

test("proposal reply is not presented as executed", () => {
  const composed = composeAssistantText({
    modelReply: "הוספתי חלב לרשימה.\nרשימת הקניות עודכנה.",
    proposalPending: true,
    persistedActions: [],
  });
  assert.equal(composed.receipt, "");
  assert.ok(composed.text.startsWith(PROPOSAL_NOT_EXECUTED_NOTICE));
  assert.equal(composed.text.includes("רשימת הקניות עודכנה."), false);
  assert.ok(composed.text.includes("הוספתי חלב לרשימה."));
});

test("persisted auto action gets a server receipt, not the model claim line", () => {
  const composed = composeAssistantText({
    modelReply: "רשימת הקניות עודכנה.\nאוסיף חלב כפי שביקשת.",
    proposalPending: false,
    persistedActions: [{ type: "shopping.add", title: "חלב" }],
  });
  assert.equal(composed.receipt, "רשימת הקניות עודכנה.");
  assert.equal(composed.conversational.includes("רשימת הקניות עודכנה."), false);
  assert.ok(composed.text.endsWith("רשימת הקניות עודכנה."));
  assert.ok(composed.text.includes("אוסיף חלב כפי שביקשת."));
});

test("no persisted mutation yields no receipt", () => {
  const composed = composeAssistantText({
    modelReply: "אפשר לתכנן את הערב בלי לשנות כלום.",
    proposalPending: false,
    persistedActions: [],
  });
  assert.equal(composed.receipt, "");
  assert.equal(composed.text.includes(PROPOSAL_NOT_EXECUTED_NOTICE), false);
});

test("exact server receipt lines are stripped from model copy", () => {
  assert.equal(neutralizePrematureExecutionClaims("בוצע."), "אפשר להמשיך.");
  assert.equal(
    buildExecutionReceipt([
      {
        type: "reminder.add",
        title: "גן",
        dueAt: "2026-09-10T07:00:00Z",
        taskId: null,
      },
    ]),
    "התזכורת נוספה.",
  );
});
