import test from "node:test";
import assert from "node:assert/strict";
import { Action, emptyState } from "../lib/model";
import { applyActions, followUps, shouldAskWorkTime } from "../lib/engine";
import { AgentOutput, parseAgentDecisionIsolated } from "../lib/agent/schema";

const now = new Date("2026-09-07T10:00:00Z");
const create = (title: string, extra = {}) =>
  ({ type: "task.create", task: { title, ...extra } }) as Action;

test("reminder urgency is explicit and defaults to medium", () => {
  let s = applyActions(
    emptyState(),
    [
      {
        type: "reminder.add",
        title: "רגילה",
        dueAt: "2026-09-07T11:00:00Z",
        taskId: null,
      },
      {
        type: "reminder.add",
        title: "דחופה",
        dueAt: "2026-09-07T11:05:00Z",
        taskId: null,
        urgency: "urgent",
      },
    ],
    now,
  );
  assert.equal(s.reminders[0].urgency, "medium");
  assert.equal(s.reminders[1].urgency, "urgent");
});

test("agent contract accepts urgency but still rejects permission changes", () => {
  assert.doesNotThrow(() =>
    AgentOutput.parse({
      reply: "תזכורת חשובה.",
      explicitActions: [
        {
          type: "reminder.add",
          title: "בדיקה",
          dueAt: "2026-09-07T11:00:00Z",
          taskId: null,
          urgency: "urgent",
        },
      ],
      clarification: null,
      proposal: null,
      affectsToday: false,
    }),
  );
  const protectedOnly = parseAgentDecisionIsolated({
    reply: "לא.",
    explicitActions: [{ type: "profile.update", patch: { aiConsent: true } }],
    clarification: null,
    proposal: null,
    affectsToday: false,
  });
  assert.equal(protectedOnly.decision.explicitActions.length, 0);
  assert.ok(protectedOnly.rejectedActions.length >= 1);
});

test("gentle follow-up candidates are unknown or overdue, never completed", () => {
  let s = applyActions(
    emptyState(),
    [
      create("עבר המועד", { dueAt: "2026-09-07T09:00:00Z" }),
      create("לא ידוע"),
      create("פתוח רגיל"),
    ],
    new Date("2026-09-07T08:00:00Z"),
  );
  s = applyActions(
    s,
    [{ type: "task.status", id: s.tasks[1].id, status: "unknown" }],
    now,
  );
  const titles = followUps(s, now).map((x) => x.title);
  assert.deepEqual(new Set(titles), new Set(["עבר המועד", "לא ידוע"]));
});

test("work-time sampling stops asking on every completion after enough evidence", () => {
  let s = emptyState();
  for (const minutes of [10, 12, 14]) {
    s = applyActions(s, [create("קיפול")], now);
    const t = s.tasks.at(-1)!;
    s = applyActions(
      s,
      [
        {
          type: "task.status",
          id: t.id,
          status: "done",
          actualWorkMinutes: minutes,
        },
      ],
      now,
    );
  }
  s = applyActions(s, [create("קיפול")], now);
  assert.equal(shouldAskWorkTime(s.tasks.at(-1)!, s), false);
});
