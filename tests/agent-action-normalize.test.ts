import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeLooseAgentAction,
  parseAgentDecisionIsolated,
} from "../lib/agent/schema";

test("agent schema normalizes taskId/completed aliases to id/done", () => {
  const id = "7bf4700e-0a9e-4a17-b0bb-5fcfad37e8bf";
  const normalized = normalizeLooseAgentAction({
    type: "task.status",
    taskId: id,
    status: "completed",
  });
  assert.deepEqual(normalized, {
    type: "task.status",
    taskId: id,
    id,
    status: "done",
  });

  const isolated = parseAgentDecisionIsolated({
    reply: "סימנתי.",
    explicitActions: [{ type: "task.status", taskId: id, status: "completed" }],
    clarification: null,
    proposal: null,
    affectsToday: false,
  });
  assert.equal(isolated.rejectedActions.length, 0);
  assert.equal(isolated.decision.explicitActions[0]?.type, "task.status");
  if (isolated.decision.explicitActions[0]?.type === "task.status") {
    assert.equal(isolated.decision.explicitActions[0].id, id);
    assert.equal(isolated.decision.explicitActions[0].status, "done");
  }
});

test("agent schema normalizes keyed task.status shorthand", () => {
  const id = "78e9ca3f-4029-4ff8-b091-ab2257913a1c";
  const isolated = parseAgentDecisionIsolated({
    reply: "סימנתי.",
    explicitActions: [{ "task.status": id, status: "done" }],
    clarification: null,
    proposal: null,
    affectsToday: false,
  });
  assert.equal(isolated.rejectedActions.length, 0);
  assert.equal(isolated.decision.explicitActions[0]?.type, "task.status");
  if (isolated.decision.explicitActions[0]?.type === "task.status") {
    assert.equal(isolated.decision.explicitActions[0].id, id);
  }
});
