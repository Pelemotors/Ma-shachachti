import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, migrateState, StateSchema } from "../lib/model";
import {
  applyActions,
  buildDailyPlanSession,
  replanDailyPlan,
  findSemanticDuplicate,
} from "../lib/engine";
import { TASK_CATEGORIES } from "../lib/taxonomy";
import { catalog } from "../lib/catalog";

test("taxonomy has exactly 32 categories including unclassified", () => {
  assert.equal(TASK_CATEGORIES.length, 32);
  assert.equal(TASK_CATEGORIES.at(-1)?.id, "unclassified");
});

test("catalog items all resolve to categoryId", () => {
  assert.ok(catalog.length >= 100);
  for (const item of catalog) {
    assert.ok(item.categoryId);
    assert.ok(TASK_CATEGORIES.some((c) => c.id === item.categoryId));
    assert.ok(item.detailTypeId, item.id);
  }
});

test("migrate V1 full state preserves ids history and deps", () => {
  const now = new Date("2026-09-07T10:00:00+03:00");
  let s = applyActions(
    emptyState(),
    [
      {
        type: "task.create",
        task: {
          title: "פינוי מדיח",
          categoryId: "kitchen_dishes",
          kind: "task",
        },
      },
      {
        type: "task.create",
        task: { title: "קיפול", categoryId: "laundry", kind: "task" },
      },
    ],
    now,
  );
  const a = s.tasks[0].id;
  const b = s.tasks[1].id;
  s = applyActions(
    s,
    [
      { type: "task.update", id: b, patch: { dependsOn: [a] } },
      { type: "task.status", id: a, status: "done", actualWorkMinutes: 7 },
    ],
    now,
  );
  const asV1 = {
    ...s,
    schemaVersion: 1 as const,
    tasks: s.tasks.map((t) => ({
      ...t,
      category: "מטבח",
      categoryId: undefined,
    })),
  };
  const migrated = migrateState(asV1);
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.tasks[0].id, a);
  assert.equal(migrated.tasks[0].completedAt, s.tasks[0].completedAt);
  assert.equal(migrated.tasks[0].actualWorkMinutes, 7);
  assert.deepEqual(migrated.tasks[1].dependsOn, [a]);
});

test("unknown legacy category becomes unclassified", () => {
  const raw = {
    schemaVersion: 1,
    profile: emptyState().profile,
    tasks: [
      {
        id: crypto.randomUUID(),
        title: "משהו מוזר",
        category: "שונות / לא מסווג",
        kind: "task",
        status: "open",
        createdAt: "2026-09-07T10:00:00+03:00",
        updatedAt: "2026-09-07T10:00:00+03:00",
        dueAt: null,
        hiddenUntil: null,
        workMinutes: 10,
        waitMinutes: 0,
        effort: 1,
        priority: 1,
        dependsOn: [],
        steps: [],
        templateId: null,
        recurrenceDays: null,
        occurrenceOf: null,
        notes: "",
        completedAt: null,
        actualWorkMinutes: null,
      },
    ],
    facts: [],
    shopping: [],
    reminders: [],
    messages: [],
    excludedTemplates: [],
    planning: { today: null },
    events: [],
  };
  const migrated = migrateState(raw);
  assert.equal(migrated.tasks[0].categoryId, "unclassified");
});

test("daily plan session persists via plan.set", () => {
  const now = new Date("2026-09-07T10:00:00+03:00");
  let s = applyActions(
    emptyState(),
    [
      {
        type: "task.create",
        task: { title: "משימה", kind: "task", workMinutes: 20 },
      },
    ],
    now,
  );
  const session = buildDailyPlanSession(s, 120, 2, 3, now);
  s = applyActions(s, [{ type: "plan.set", plan: session }], now);
  assert.equal(s.planning.plan?.items.length, 1);
  assert.equal(s.planning.plan?.generatedFromRevision, 3);
});

test("stable replan keeps locked and done items", () => {
  const now = new Date("2026-09-07T10:00:00+03:00");
  let s = applyActions(
    emptyState(),
    [
      {
        type: "task.create",
        task: { title: "א", kind: "task", workMinutes: 15 },
      },
      {
        type: "task.create",
        task: { title: "ב", kind: "task", workMinutes: 15 },
      },
    ],
    now,
  );
  const session = buildDailyPlanSession(s, 120, 3, 1, now);
  session.items[0].locked = true;
  session.items[0].planStatus = "in_progress";
  s = applyActions(s, [{ type: "plan.set", plan: session }], now);
  s = applyActions(s, [{ type: "task.start", id: s.tasks[0].id }], now);
  const result = replanDailyPlan(s, now);
  assert.ok(result.plan);
  const first = result.plan!.items.find((i) => i.taskId === s.tasks[0].id);
  assert.ok(first);
  assert.equal(first!.locked || first!.planStatus === "in_progress", true);
});

test("semantic duplicate detection", () => {
  const now = new Date("2026-09-07T10:00:00+03:00");
  const s = applyActions(
    emptyState(),
    [
      {
        type: "task.create",
        task: {
          title: "פינוי מדיח",
          categoryId: "kitchen_dishes",
          detailTypeId: "dishwasher_empty",
          kind: "task",
        },
      },
    ],
    now,
  );
  const exact = findSemanticDuplicate(s, "פינוי מדיח", {
    categoryId: "kitchen_dishes",
    detailTypeId: "dishwasher_empty",
  });
  assert.equal(exact?.id, s.tasks[0].id);
  const loose = findSemanticDuplicate(s, "לרוקן את המדיח", {
    categoryId: "kitchen_dishes",
  });
  assert.equal(loose, undefined, "paraphrase dedupe is agent responsibility");
});

test("StateSchema dual-read accepts missing planning", () => {
  const legacy = emptyState() as Record<string, unknown>;
  delete legacy.planning;
  (legacy as { schemaVersion: number }).schemaVersion = 1;
  const parsed = StateSchema.parse(legacy);
  assert.equal(parsed.schemaVersion, 2);
  assert.deepEqual(parsed.planning, { today: null, plan: null });
});
