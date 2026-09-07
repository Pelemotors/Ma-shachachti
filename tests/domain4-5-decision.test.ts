import test from "node:test";
import assert from "node:assert/strict";
import { applyActions } from "../lib/engine";
import { emptyState } from "../lib/model";
import { buildSharedDecisionContext } from "../lib/domain/decision-context";
import { freeTime } from "../lib/domain/free-time";
import { whatMatters } from "../lib/domain/tasks";
import { rankForgotten } from "../lib/domain/forgotten";

const now = new Date("2026-09-08T10:00:00.000+03:00");

function seed() {
  let s = emptyState();
  s = applyActions(
    s,
    [
      {
        type: "task.create",
        task: {
          title: "דדליין קרוב",
          kind: "task",
          priority: 3,
          dueAt: "2026-09-08T12:00:00.000+03:00",
          workMinutes: 20,
        },
      },
      {
        type: "task.create",
        task: {
          title: "תלויה",
          kind: "task",
          priority: 2,
          workMinutes: 15,
        },
      },
      {
        type: "task.create",
        task: {
          title: "רגילה ישנה",
          kind: "task",
          priority: 1,
          workMinutes: 10,
          categoryId: "unclassified",
        },
      },
    ],
    now,
  );
  const blocker = s.tasks.find((t) => t.title === "דדליין קרוב")!;
  const dependent = s.tasks.find((t) => t.title === "תלויה")!;
  s = applyActions(
    s,
    [
      {
        type: "task.update",
        id: dependent.id,
        patch: { dependsOn: [blocker.id] },
      },
    ],
    now,
  );
  return s;
}

test("domain4: shared context exposes urgency feasibility dependencies", () => {
  const state = seed();
  const ctx = buildSharedDecisionContext(state, now);
  const urgent = ctx.tasks.find((t) => t.task.title === "דדליין קרוב")!;
  const blockedTask = ctx.tasks.find((t) => t.task.title === "תלויה")!;
  assert.ok(urgent.urgency > blockedTask.urgency);
  assert.equal(blockedTask.dependencyReady, false);
  assert.ok(urgent.estimatedDuration >= 1);
  assert.ok(ctx.members);
  assert.ok(Array.isArray(ctx.temporaryFacts));
});

test("domain4: freeTime and whatMatters share structured ranking inputs", () => {
  const state = seed();
  const matters = whatMatters(state, now);
  assert.equal(matters[0]?.title, "דדליין קרוב");
  const ft = freeTime({ state, duration: 30, effort: 3, now });
  assert.ok(ft.context.tasks.length >= 3);
  // Dependent task is not feasible until prerequisite done.
  assert.ok(!ft.closeFirst.some((t) => t.title === "תלויה"));
});

test("domain5: forgotten respects hiddenUntil and caps overload", () => {
  let state = seed();
  const old = state.tasks.find((t) => t.title === "רגילה ישנה")!;
  state = applyActions(
    state,
    [
      {
        type: "task.deferUntil",
        id: old.id,
        hiddenUntil: "2026-09-09T00:00:00.000+03:00",
      },
    ],
    now,
  );
  const ranked = rankForgotten(state, now, 6);
  assert.ok(!ranked.some((i) => i.task.id === old.id));
  assert.ok(ranked.length <= 6);
  // Age alone should not outrank hard deadline.
  const top = ranked[0];
  assert.equal(top?.task.title, "דדליין קרוב");
});
