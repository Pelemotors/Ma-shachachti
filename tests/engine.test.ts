import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyState, Action, normalize } from "../lib/model";
import {
  applyActions,
  whatMatters,
  opportunities,
  planDay,
  activeFacts,
  estimatedMinutes,
  learning,
  requiresConfirmation,
} from "../lib/engine";
import { nextDayStart, dayKey, addCalendarDays } from "../lib/time";
import { suggestions, templateAction, catalog } from "../lib/catalog";
import { consumptionInsights } from "../lib/insights";
import { validPushEndpoint } from "../lib/push";
const now = new Date("2026-09-06T10:00:00Z");
const create = (title: string, extra = {}) =>
  ({ type: "task.create", task: { title, ...extra } }) as Action;
test("ideas do not become duties in what matters or daily plan", () => {
  const s = applyActions(
    emptyState(),
    [create("פשטידה", { kind: "idea" })],
    now,
  );
  assert.equal(whatMatters(s, now).length, 0);
  assert.equal(planDay(s, 120, 3, now).selected.length, 0);
  assert.equal(opportunities(s, 60, 3, now).candidates.length, 1);
  assert.equal(s.tasks[0].dueAt, null);
});
test("not today preserves due date and hides until local midnight, including deadline", () => {
  let s = applyActions(
    emptyState(),
    [create("כביסה", { dueAt: "2026-09-06T14:00:00Z" })],
    now,
  );
  s = applyActions(s, [{ type: "task.defer", id: s.tasks[0].id }], now);
  assert.equal(s.tasks[0].dueAt, "2026-09-06T14:00:00Z");
  assert.equal(s.tasks[0].status, "open");
  assert.equal(s.tasks[0].hiddenUntil, "2026-09-06T21:00:00.000Z");
  assert.equal(whatMatters(s, now).length, 0);
});
test("same normalized open occurrence deduplicates; completion allows a new occurrence", () => {
  let s = applyActions(
    emptyState(),
    [create("פינוי מדיח"), create("  פינוי  מדיח!")],
    now,
  );
  assert.equal(s.tasks.length, 1);
  s = applyActions(
    s,
    [
      { type: "task.status", id: s.tasks[0].id, status: "done" },
      create("פינוי מדיח"),
    ],
    now,
  );
  assert.equal(s.tasks.length, 2);
});
test("completing kitchen does not complete dishwasher", () => {
  let s = applyActions(emptyState(), [create("מטבח"), create("מדיח")], now);
  s = applyActions(
    s,
    [{ type: "task.status", id: s.tasks[0].id, status: "done" }],
    now,
  );
  assert.equal(s.tasks[1].status, "open");
});
test("recurrence creates exactly one future occurrence on repeated completion", () => {
  let s = applyActions(
    emptyState(),
    [create("מצעים", { recurrenceDays: 7 })],
    now,
  );
  const id = s.tasks[0].id;
  s = applyActions(s, [{ type: "task.status", id, status: "done" }], now);
  s = applyActions(s, [{ type: "task.status", id, status: "done" }], now);
  assert.equal(s.tasks.length, 2);
  assert.equal(s.tasks[1].occurrenceOf, id);
  assert.equal(whatMatters(s, now).length, 0);
});
test("expired temporary information becomes unknown, not its opposite", () => {
  const s = applyActions(
    emptyState(),
    [
      {
        type: "fact.add",
        text: "הילדה ישנה",
        kind: "temporary",
        expiresAt: "2026-09-06T10:30:00Z",
      },
    ],
    now,
  );
  assert.equal(activeFacts(s, now).length, 1);
  assert.equal(activeFacts(s, new Date("2026-09-06T11:00:00Z")).length, 0);
  assert.equal(s.facts.length, 1);
});
test("temporary information without expiry is rejected", () =>
  assert.throws(() =>
    applyActions(
      emptyState(),
      [
        {
          type: "fact.add",
          text: "לבד היום",
          kind: "temporary",
          expiresAt: null,
        },
      ],
      now,
    ),
  ));
test("dependency gate and work/wait overlap produce feasible plan", () => {
  let s = applyActions(
    emptyState(),
    [
      create("מכונה", { workMinutes: 5, waitMinutes: 60 }),
      create("מטבח", { workMinutes: 15 }),
    ],
    now,
  );
  s = applyActions(
    s,
    [create("תלייה", { workMinutes: 10, dependsOn: [s.tasks[0].id] })],
    now,
  );
  const plan = planDay(s, 120, 3, now).selected;
  const wash = plan.find((x) => x.task.title === "מכונה")!,
    kitchen = plan.find((x) => x.task.title === "מטבח")!,
    hang = plan.find((x) => x.task.title === "תלייה")!;
  assert.ok(kitchen.start < wash.end);
  assert.ok(hang.start >= wash.end);
  assert.ok(
    !opportunities(s, 30, 3, now).candidates.some((t) => t.title === "תלייה"),
  );
});
test("dependency cycles fail atomically and do not mutate input", () => {
  const s = applyActions(emptyState(), [create("א"), create("ב")], now);
  assert.throws(() =>
    applyActions(
      s,
      [
        {
          type: "task.update",
          id: s.tasks[0].id,
          patch: { dependsOn: [s.tasks[1].id] },
        },
        {
          type: "task.update",
          id: s.tasks[1].id,
          patch: { dependsOn: [s.tasks[0].id] },
        },
      ],
      now,
    ),
  );
  assert.equal(s.tasks[0].dependsOn.length, 0);
});
test("missing identifiers rejected", () =>
  assert.throws(() =>
    applyActions(
      emptyState(),
      [{ type: "task.status", id: crypto.randomUUID(), status: "done" }],
      now,
    ),
  ));
test("high stakes for time are still visible outside opportunity match", () => {
  const s = applyActions(
    emptyState(),
    [
      create("תור חשוב", { workMinutes: 90, dueAt: "2026-09-06T12:00:00Z" }),
      create("מילוי מים", { workMinutes: 3, effort: 1 }),
    ],
    now,
  );
  const r = opportunities(s, 20, 1, now);
  assert.equal(r.candidates.length, 1);
  assert.equal(r.important.length, 1);
});
test("no work is recommended beyond time including buffer and wait", () => {
  const s = applyActions(
    emptyState(),
    [create("מנה", { workMinutes: 5, waitMinutes: 25 })],
    now,
  );
  assert.equal(opportunities(s, 20, 3, now).candidates.length, 0);
});
test("shopping duplicate keeps a single open item but preserves purchase history", () => {
  let s = applyActions(
    emptyState(),
    [
      { type: "shopping.add", title: "חלב" },
      { type: "shopping.add", title: "חלב", quantity: "2" },
    ],
    now,
  );
  assert.equal(s.shopping.length, 1);
  s = applyActions(
    s,
    [
      { type: "shopping.check", id: s.shopping[0].id, checked: true },
      { type: "shopping.add", title: "חלב" },
    ],
    now,
  );
  assert.equal(s.shopping.length, 2);
});
test("broad actions require explicit confirmation", () => {
  const a = Array.from({ length: 6 }, (_, i) => create("משימה " + i));
  assert.ok(requiresConfirmation(a));
  assert.throws(() => applyActions(emptyState(), a, now));
  assert.equal(applyActions(emptyState(), a, now, true).tasks.length, 6);
});
test("destructive actions and permission changes require confirmation", () => {
  assert.ok(requiresConfirmation([{ type: "history.clear" }]));
  assert.ok(
    requiresConfirmation([
      { type: "profile.update", patch: { aiConsent: true } },
    ]),
  );
});
test("reported work durations use median after three samples only", () => {
  let s = emptyState();
  for (const mins of [12, 15, 300]) {
    s = applyActions(s, [create("קיפול")], now);
    s = applyActions(
      s,
      [
        {
          type: "task.status",
          id: s.tasks.at(-1)!.id,
          status: "done",
          actualWorkMinutes: mins,
        },
      ],
      now,
    );
  }
  s = applyActions(s, [create("קיפול", { workMinutes: 30 })], now);
  assert.equal(estimatedMinutes(s.tasks.at(-1)!, s), 15);
});
test("unreported elapsed time never becomes personal pace evidence", () => {
  let s = applyActions(
    emptyState(),
    [create("כביסה", { workMinutes: 20 })],
    now,
  );
  s = applyActions(
    s,
    [{ type: "task.status", id: s.tasks[0].id, status: "done" }],
    new Date(now.getTime() + 3600000),
  );
  assert.equal(s.tasks[0].actualWorkMinutes, null);
});
test("one unusual occurrence is not enough to learn a habit", () => {
  const s = applyActions(emptyState(), [create("מצעים")], now);
  assert.equal(learning(s).length, 0);
});
test("catalog contains 100+ relevant proposals without assigning obligations", () => {
  const s = emptyState();
  assert.ok(catalog.length >= 100);
  assert.ok(!suggestions(s).some((t) => t.requires === "pets"));
  assert.equal(s.tasks.length, 0);
  const t = suggestions(s)[0];
  const accepted = applyActions(s, [templateAction(t.id)], now);
  assert.equal(accepted.tasks.length, 1);
  assert.equal(accepted.tasks[0].recurrenceDays, null);
});
test("excluded suggestions stay excluded until explicitly restored", () => {
  let s = applyActions(
    emptyState(),
    [{ type: "template.exclude", id: "kit-01-03" }],
    now,
  );
  assert.ok(!suggestions(s).some((t) => t.id === "kit-01-03"));
  s = applyActions(s, [{ type: "template.restore", id: "kit-01-03" }], now);
  assert.ok(suggestions(s).some((t) => t.id === "kit-01-03"));
});
test("reminders require future time and cancel on completion", () => {
  assert.throws(() =>
    applyActions(
      emptyState(),
      [
        {
          type: "reminder.add",
          title: "מאוחר",
          dueAt: "2026-09-05T10:00:00Z",
          taskId: null,
        },
      ],
      now,
    ),
  );
  let s = applyActions(emptyState(), [create("מטבח")], now);
  s = applyActions(
    s,
    [
      {
        type: "reminder.add",
        title: "מטבח",
        dueAt: "2026-09-06T11:00:00Z",
        taskId: s.tasks[0].id,
      },
    ],
    now,
  );
  s = applyActions(
    s,
    [{ type: "task.status", id: s.tasks[0].id, status: "done" }],
    now,
  );
  assert.equal(s.reminders[0].status, "cancelled");
});
test("timezone day boundary and DST recurrence preserve wall-clock hour", () => {
  assert.equal(
    dayKey(new Date(nextDayStart(now, "Asia/Jerusalem")), "Asia/Jerusalem"),
    "2026-09-07",
  );
  const start = "2026-03-26T08:00:00Z";
  assert.equal(
    addCalendarDays(start, 2, "Asia/Jerusalem"),
    "2026-03-28T07:00:00.000Z",
  );
});
test("push endpoints cannot target internal network or arbitrary hosts", () => {
  assert.ok(validPushEndpoint("https://fcm.googleapis.com/fcm/send/abc"));
  for (const u of [
    "http://localhost",
    "https://127.0.0.1",
    "https://evil.com",
    "https://fcm.googleapis.com.evil.com",
    "https://fcm.googleapis.com:444/a",
  ])
    assert.equal(validPushEndpoint(u), false);
});
test("purchase forecast requires repeated consistent intervals, does not assert stock empty", () => {
  let s = emptyState();
  for (let i = 0; i < 4; i++) {
    const date = new Date(now.getTime() + i * 30 * 86400000);
    s = applyActions(s, [{ type: "shopping.add", title: "אוכל לכלב" }], date);
    s = applyActions(
      s,
      [{ type: "shopping.check", id: s.shopping.at(-1)!.id, checked: true }],
      date,
    );
  }
  assert.equal(consumptionInsights(s)[0].days, 30);
  assert.equal(consumptionInsights(s)[0].samples, 4);
});
