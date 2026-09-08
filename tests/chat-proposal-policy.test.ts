import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { emptyState, type Action } from "../lib/model";
import { applyActions } from "../lib/engine";
import {
  classifyActionPolicy,
  partitionActionsByPolicy,
  chatActionsNeedProposal,
} from "../lib/agent/schema";
import {
  classifyTaskDuplicate,
  isHardDuplicate,
} from "../lib/domain/tasks/dedupe";
import { revalidateProposalActions } from "../lib/server/proposals";
import {
  AGENT_INSTRUCTIONS,
  AGENT_CONTRACT_VERSION,
} from "../lib/agent/instructions";

test("P0: task.create always classifies as proposal", () => {
  const a: Action = {
    type: "task.create",
    task: { title: "להפעיל מדיח", kind: "task" },
  };
  assert.equal(classifyActionPolicy(a), "proposal");
  assert.equal(chatActionsNeedProposal([a]), true);
});

test("P0: single and five task.create go to proposal bucket, not auto", () => {
  const one = partitionActionsByPolicy([
    { type: "task.create", task: { title: "כביסה", kind: "task" } },
  ]);
  assert.equal(one.auto.length, 0);
  assert.equal(one.proposal.length, 1);

  const five = partitionActionsByPolicy(
    Array.from({ length: 5 }, (_, i) => ({
      type: "task.create" as const,
      task: { title: `משימה ${i}`, kind: "task" as const },
    })),
  );
  assert.equal(five.auto.length, 0);
  assert.equal(five.proposal.length, 5);
});

test("P0: autoApply-safe shopping stays auto; task.create still proposal", () => {
  const { auto, proposal } = partitionActionsByPolicy([
    { type: "shopping.add", title: "חלב" },
    { type: "task.create", task: { title: "לשטוף רצפה", kind: "task" } },
  ]);
  assert.equal(auto.length, 1);
  assert.equal(auto[0]?.type, "shopping.add");
  assert.equal(proposal.length, 1);
  assert.equal(proposal[0]?.type, "task.create");
});

test("P0: message without tasks yields empty proposal partition", () => {
  const { proposal } = partitionActionsByPolicy([]);
  assert.equal(proposal.length, 0);
});

test("P0: approving proposal applies creates; reject path leaves state", () => {
  let state = emptyState();
  state = {
    ...state,
    profile: { ...state.profile, autoApply: true, onboarded: true },
  };
  const actions: Action[] = [
    { type: "task.create", task: { title: "לקפל כביסה", kind: "task" } },
  ];
  // autoApply must not matter — partition still proposal
  assert.equal(partitionActionsByPolicy(actions).proposal.length, 1);
  const after = applyActions(state, actions, new Date(), true);
  assert.equal(after.tasks.length, 1);
  assert.equal(state.tasks.length, 0);
});

test("P0: removing one item from proposal list leaves the rest", () => {
  const actions: Action[] = [
    { type: "task.create", task: { title: "א", kind: "task" } },
    { type: "task.create", task: { title: "ב", kind: "task" } },
    { type: "task.create", task: { title: "ג", kind: "task" } },
  ];
  const kept = actions.filter((_, i) => i !== 1);
  assert.equal(kept.length, 2);
  assert.deepEqual(
    kept.map((a) => (a.type === "task.create" ? a.task.title : "")),
    ["א", "ג"],
  );
});

test("P1: exact duplicate is hard; apply does not create twice", () => {
  let state = emptyState();
  state = applyActions(state, [
    { type: "task.create", task: { title: "מדיח", kind: "task" } },
  ]);
  const match = classifyTaskDuplicate(state, {
    title: "מדיח",
    kind: "task",
  });
  assert.ok(isHardDuplicate(match));
  const again = applyActions(state, [
    { type: "task.create", task: { title: "מדיח", kind: "task" } },
  ]);
  assert.equal(again.tasks.length, 1);
});

test("P1: canonical detailTypeId+category duplicate is hard", () => {
  let state = emptyState();
  state = applyActions(state, [
    {
      type: "task.create",
      task: {
        title: "להפעיל מדיח",
        kind: "task",
        categoryId: "kitchen_dishes",
        detailTypeId: "dishwasher_run",
      },
    },
  ]);
  const match = classifyTaskDuplicate(state, {
    title: "לשים מדיח",
    kind: "task",
    categoryId: "kitchen_dishes",
    detailTypeId: "dishwasher_run",
  });
  assert.equal(match.confidence, "canonical");
  const next = applyActions(state, [
    {
      type: "task.create",
      task: {
        title: "לשים מדיח",
        kind: "task",
        categoryId: "kitchen_dishes",
        detailTypeId: "dishwasher_run",
      },
    },
  ]);
  assert.equal(next.tasks.length, 1);
});

test("P1: revalidate drops invalid ids but keeps valid creates", () => {
  const state = emptyState();
  const { applicable, rejected } = revalidateProposalActions(state, [
    { type: "task.create", task: { title: "חדשה", kind: "task" } },
    { type: "task.status", id: crypto.randomUUID(), status: "done" },
  ]);
  assert.equal(applicable.length, 1);
  assert.equal(applicable[0]?.type, "task.create");
  assert.equal(rejected.length, 1);
});

test("P1: revision-unrelated state still revalidates proposal actions", () => {
  let state = emptyState();
  state = applyActions(state, [{ type: "shopping.add", title: "לחם" }]);
  const { applicable } = revalidateProposalActions(state, [
    { type: "task.create", task: { title: "שאיבה", kind: "task" } },
  ]);
  assert.equal(applicable.length, 1);
});

test("P1: agent instructions are bundled — no runtime readFile dependency marker", () => {
  assert.ok(AGENT_INSTRUCTIONS.length > 500);
  assert.ok(AGENT_INSTRUCTIONS.includes("task.create"));
  assert.ok(AGENT_CONTRACT_VERSION.length > 0);
  const orch = readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "../lib/agent/orchestration.ts",
    ),
    "utf8",
  );
  assert.ok(!orch.includes("readFile("));
  assert.ok(orch.includes("AGENT_INSTRUCTIONS"));
});

test("P1: instructions.ts stays synced with INSTRUCTIONS.he.md", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const md = readFileSync(join(root, "lib/agent/INSTRUCTIONS.he.md"), "utf8");
  assert.ok(md.includes("משימה חדשה שהוסקה"));
  assert.ok(AGENT_INSTRUCTIONS.includes("משימה חדשה שהוסקה"));
  assert.ok(md.includes("חוזה הפלט"));
  assert.ok(AGENT_INSTRUCTIONS.includes("חוזה הפלט"));
});
