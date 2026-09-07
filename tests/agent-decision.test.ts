import test from "node:test";
import assert from "node:assert/strict";
import {
  AgentDecisionSchema,
  parseAgentDecisionIsolated,
  parseAgentDecisionText,
} from "../lib/agent/schema";

const base = {
  reply: "טיפלתי בחלקים הברורים.",
  explicitActions: [] as unknown[],
  clarification: null as null | {
    question: string;
    unresolvedPart: string | null;
  },
  proposal: null,
  affectsToday: false,
};

test("W13 valid payload parses fully", () => {
  const decision = AgentDecisionSchema.parse({
    ...base,
    explicitActions: [
      { type: "task.create", task: { title: "להפעיל מדיח", kind: "task" } },
      {
        type: "task.create",
        task: { title: "להזמין אוכל לכלב", kind: "task" },
      },
    ],
    clarification: {
      question: "מה לעשות עם הכביסה?",
      unresolvedPart: "הכביסה",
    },
    affectsToday: true,
  });
  assert.equal(decision.explicitActions.length, 2);
  assert.equal(decision.clarification?.unresolvedPart, "הכביסה");
});

test("W13 clarification + safe action keeps both", () => {
  const { decision, rejectedActions } = parseAgentDecisionIsolated({
    ...base,
    explicitActions: [
      { type: "task.create", task: { title: "אוכל לכלב", kind: "task" } },
    ],
    clarification: { question: "מה עם הכביסה?", unresolvedPart: "כביסה" },
  });
  assert.equal(decision.explicitActions.length, 1);
  assert.ok(decision.clarification);
  assert.equal(rejectedActions.length, 0);
});

test("W13 malformed action between valid actions is isolated", () => {
  const { decision, rejectedActions } = parseAgentDecisionIsolated({
    ...base,
    reply: "שמרתי את התקינים.",
    explicitActions: [
      { type: "task.create", task: { title: "מדיח", kind: "task" } },
      { type: "task.create", task: { title: "" } },
      { type: "shopping.add", title: "חלב" },
    ],
  });
  assert.equal(decision.explicitActions.length, 2);
  assert.equal(decision.explicitActions[0].type, "task.create");
  assert.equal(decision.explicitActions[1].type, "shopping.add");
  assert.equal(rejectedActions.length, 1);
  assert.equal(decision.reply, "שמרתי את התקינים.");
});

test("W13 reply survives when all actions are malformed", () => {
  const { decision, rejectedActions } = parseAgentDecisionIsolated({
    ...base,
    reply: "צריך לנסח שוב את הפרטים.",
    explicitActions: [
      { type: "task.update", id: "not-a-uuid", patch: { title: "x" } },
      { type: "profile.update", patch: { aiConsent: true } },
    ],
  });
  assert.equal(decision.explicitActions.length, 0);
  assert.ok(rejectedActions.length >= 2);
  assert.match(decision.reply, /לנסח/);
});

test("W13 invalid JSON throws", () => {
  assert.throws(
    () => parseAgentDecisionText("{not json"),
    /agent_invalid_json/,
  );
});

test("W13 invalid ID is rejected without dropping siblings", () => {
  const { decision, rejectedActions } = parseAgentDecisionIsolated({
    ...base,
    explicitActions: [
      { type: "shopping.add", title: "לחם" },
      { type: "task.status", id: "not-a-uuid", status: "done" },
      { type: "task.create", task: { title: "קיפול", kind: "task" } },
    ],
  });
  assert.equal(decision.explicitActions.length, 2);
  assert.equal(rejectedActions.length, 1);
  assert.equal(decision.explicitActions[0].type, "shopping.add");
  assert.equal(decision.explicitActions[1].type, "task.create");
});

test("W13 safe actions + proposal in same turn", () => {
  const decision = AgentDecisionSchema.parse({
    ...base,
    explicitActions: [{ type: "shopping.add", title: "חלב" }],
    proposal: {
      summary: "להוסיף רשימת רכיבים מהמתכון",
      reason: "shopping_derived",
      proposedActions: [
        { type: "shopping.add", title: "סלמון" },
        { type: "shopping.add", title: "בטטה" },
      ],
    },
  });
  assert.equal(decision.explicitActions.length, 1);
  assert.equal(decision.proposal?.proposedActions.length, 2);
});

test("W13 legacy actions field still isolated", () => {
  const { decision } = parseAgentDecisionIsolated({
    reply: "תואם לאחור.",
    actions: [{ type: "task.create", task: { title: "ישן", kind: "task" } }],
    clarification: null,
    proposal: null,
    affectsToday: false,
  });
  assert.equal(decision.explicitActions.length, 1);
});
