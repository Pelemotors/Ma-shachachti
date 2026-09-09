import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyState,
  migrateState,
  StateSchema,
  StateV2Schema,
} from "../lib/model";
import { applyActions } from "../lib/engine";

const STAMP = "2026-09-01T08:00:00.000+03:00";
const STAMP2 = "2026-09-05T12:30:00.000+03:00";
const STAMP3 = "2026-09-06T18:00:00.000+03:00";

function richV1Fixture() {
  const taskOpen = crypto.randomUUID();
  const taskDone = crypto.randomUUID();
  const taskHidden = crypto.randomUUID();
  const factId = crypto.randomUUID();
  const shopId = crypto.randomUUID();
  const reminderId = crypto.randomUUID();
  const msgId = crypto.randomUUID();
  return {
    schemaVersion: 1 as const,
    profile: {
      ...emptyState().profile,
      name: "בית בדיקה",
      children: 1,
      pets: true,
      onboarded: true,
    },
    tasks: [
      {
        id: taskOpen,
        title: "כביסה",
        category: "כביסה",
        kind: "task" as const,
        status: "open" as const,
        createdAt: STAMP,
        updatedAt: STAMP2,
        dueAt: "2026-09-08T10:00:00.000+03:00",
        hiddenUntil: null,
        workMinutes: 25,
        waitMinutes: 0,
        effort: 2,
        priority: 2,
        dependsOn: [] as string[],
        steps: [] as unknown[],
        templateId: null,
        recurrenceDays: 7,
        occurrenceOf: null,
        notes: "רגילה",
        completedAt: null,
        actualWorkMinutes: null,
      },
      {
        id: taskDone,
        title: "פינוי מדיח",
        category: "מטבח",
        kind: "task" as const,
        status: "done" as const,
        createdAt: STAMP,
        updatedAt: STAMP3,
        dueAt: null,
        hiddenUntil: null,
        workMinutes: 10,
        waitMinutes: 0,
        effort: 1,
        priority: 1,
        dependsOn: [] as string[],
        steps: [] as unknown[],
        templateId: null,
        recurrenceDays: null,
        occurrenceOf: null,
        notes: "",
        completedAt: STAMP3,
        actualWorkMinutes: 8,
      },
      {
        id: taskHidden,
        title: "סלון",
        category: "סלון",
        kind: "task" as const,
        status: "open" as const,
        createdAt: STAMP,
        updatedAt: STAMP,
        dueAt: null,
        hiddenUntil: "2026-09-09T00:00:00.000+03:00",
        workMinutes: 20,
        waitMinutes: 0,
        effort: 2,
        priority: 1,
        dependsOn: [taskOpen],
        steps: [] as unknown[],
        templateId: null,
        recurrenceDays: null,
        occurrenceOf: null,
        notes: "לא היום",
        completedAt: null,
        actualWorkMinutes: null,
      },
    ],
    facts: [
      {
        id: factId,
        text: "יש כלב",
        kind: "stable" as const,
        createdAt: STAMP,
        expiresAt: null,
        source: "user" as const,
      },
    ],
    shopping: [
      {
        id: shopId,
        title: "חלב",
        createdAt: STAMP,
        purchasedAt: null,
        quantity: "1",
      },
    ],
    reminders: [
      {
        id: reminderId,
        title: "תזכורת אוכל לכלב",
        dueAt: "2026-09-08T20:00:00.000+03:00",
        taskId: null,
        status: "pending" as const,
        urgency: "medium" as const,
      },
    ],
    messages: [
      {
        id: msgId,
        role: "user" as const,
        text: "שלום",
        createdAt: STAMP,
      },
    ],
    excludedTemplates: ["deep_clean_oven"],
    planning: {
      today: {
        date: "2026-09-07",
        availableFrom: "2026-09-07T10:00:00.000+03:00",
        availableUntil: "2026-09-07T14:00:00.000+03:00",
        unavailable: [] as unknown[],
        effort: 2,
        note: "חלון קצר",
      },
    },
    events: [
      {
        id: crypto.randomUUID(),
        at: STAMP2,
        type: "task.done",
        summary: "פינוי מדיח",
      },
    ],
    _ids: { taskOpen, taskDone, taskHidden, factId, shopId, reminderId, msgId },
  };
}

test("Gate2 rich V1 fixture migrates without losing core data or ids", () => {
  const v1 = richV1Fixture();
  const { _ids, ...payload } = v1;
  const v2 = migrateState(payload);
  assert.equal(v2.schemaVersion, 2);
  assert.equal(v2.tasks.length, 3);
  assert.equal(v2.tasks[0].id, _ids.taskOpen);
  assert.equal(v2.tasks[1].id, _ids.taskDone);
  assert.equal(v2.tasks[2].id, _ids.taskHidden);
  assert.equal(v2.tasks[0].createdAt, STAMP);
  assert.equal(v2.tasks[0].updatedAt, STAMP2);
  assert.equal(v2.tasks[0].dueAt, "2026-09-08T10:00:00.000+03:00");
  assert.equal(v2.tasks[0].recurrenceDays, 7);
  assert.equal(v2.tasks[1].completedAt, STAMP3);
  assert.equal(v2.tasks[1].actualWorkMinutes, 8);
  assert.equal(v2.tasks[2].hiddenUntil, "2026-09-09T00:00:00.000+03:00");
  assert.deepEqual(v2.tasks[2].dependsOn, [_ids.taskOpen]);
  assert.equal(v2.facts[0].id, _ids.factId);
  assert.equal(v2.facts[0].text, "יש כלב");
  assert.equal(v2.shopping[0].id, _ids.shopId);
  assert.equal(v2.reminders[0].id, _ids.reminderId);
  assert.equal(v2.messages[0].id, _ids.msgId);
  assert.deepEqual(v2.excludedTemplates, ["deep_clean_oven"]);
  assert.equal(v2.planning.today?.note, "חלון קצר");
  assert.equal(v2.profile.name, "בית בדיקה");
  // Neutral V2-only defaults — no invented members/routines
  assert.deepEqual(v2.members, []);
  assert.deepEqual(v2.homeAreas, []);
  assert.equal(v2.firstScan.status, "not_started");
  assert.equal(v2.learning.length, 0);
});

test("Gate2 migration is idempotent for already-migrated V2", () => {
  const v1 = richV1Fixture();
  const { _ids: _a, ...payload } = v1;
  const once = migrateState(payload);
  const twice = migrateState(once);
  assert.equal(twice.schemaVersion, 2);
  assert.equal(twice.tasks[0].id, once.tasks[0].id);
  assert.equal(twice.tasks[0].createdAt, once.tasks[0].createdAt);
  assert.equal(twice.tasks.length, once.tasks.length);
  assert.equal(twice.shopping.length, once.shopping.length);
  assert.equal(twice.reminders.length, once.reminders.length);
  assert.equal(twice.facts.length, once.facts.length);
});

test("Gate2 V2 round-trip serialize/parse preserves content", () => {
  const now = new Date("2026-09-07T10:00:00+03:00");
  let s = applyActions(
    emptyState(),
    [
      {
        type: "task.create",
        task: {
          title: "קיפול",
          categoryId: "laundry",
          kind: "task",
          workMinutes: 15,
        },
      },
      { type: "shopping.add", title: "לחם" },
      {
        type: "reminder.add",
        title: "תזכורת",
        dueAt: "2026-09-08T09:00:00.000+03:00",
        taskId: null,
      },
      {
        type: "fact.add",
        text: "אין מייבש",
        kind: "stable",
        expiresAt: null,
      },
    ],
    now,
  );
  const json = JSON.parse(JSON.stringify(s));
  const back = StateV2Schema.parse(migrateState(json));
  assert.equal(back.schemaVersion, 2);
  assert.equal(back.tasks[0].id, s.tasks[0].id);
  assert.equal(back.tasks[0].title, "קיפול");
  assert.equal(back.shopping[0].title, "לחם");
  assert.equal(back.reminders[0].title, "תזכורת");
  assert.equal(back.facts[0].text, "אין מייבש");
});

test("Gate2 V1 load then user change serializes as V2 without inventing duplicates", () => {
  const v1 = richV1Fixture();
  const { _ids, ...payload } = v1;
  const runtime = migrateState(payload);
  const now = new Date("2026-09-07T11:00:00+03:00");
  const next = applyActions(
    runtime,
    [{ type: "task.status", id: _ids.taskOpen, status: "done" }],
    now,
  );
  const serialized = StateV2Schema.parse(next);
  assert.equal(serialized.schemaVersion, 2);
  assert.equal(
    new Set(serialized.tasks.map((t) => t.id)).size,
    serialized.tasks.length,
  );
  assert.equal(
    serialized.tasks.find((t) => t.id === _ids.taskOpen)?.status,
    "done",
  );
  assert.ok(serialized.tasks.find((t) => t.id === _ids.taskOpen)?.completedAt);
  // Original hidden/done task ids remain present (no migration duplicates).
  assert.ok(serialized.tasks.some((t) => t.id === _ids.taskHidden));
  assert.ok(serialized.tasks.some((t) => t.id === _ids.taskDone));
});

test("Gate2 unsupported schemaVersion is rejected explicitly", () => {
  assert.throws(
    () => migrateState({ ...emptyState(), schemaVersion: 99 }),
    /unsupported_schema_version:99/,
  );
  assert.throws(
    () => migrateState({ ...emptyState(), schemaVersion: "nope" }),
    /unsupported_schema_version/,
  );
});

test("Gate2 string schemaVersion 1 and 2 are accepted", () => {
  const v1 = richV1Fixture();
  const { _ids: _x, ...payload } = v1;
  const fromString1 = migrateState({ ...payload, schemaVersion: "1" });
  assert.equal(fromString1.schemaVersion, 2);
  assert.equal(fromString1.tasks[0].id, v1._ids.taskOpen);
  const v2 = migrateState(fromString1);
  const fromString2 = migrateState({ ...v2, schemaVersion: "2" });
  assert.equal(fromString2.schemaVersion, 2);
  assert.equal(fromString2.tasks[0].id, v1._ids.taskOpen);
});

test("Gate2 V1 without optional fields does not crash", () => {
  const minimal = {
    schemaVersion: 1,
    profile: emptyState().profile,
    tasks: [],
    facts: [],
    shopping: [],
    reminders: [],
    messages: [],
    excludedTemplates: [],
  };
  const v2 = StateSchema.parse(minimal);
  assert.equal(v2.schemaVersion, 2);
  assert.deepEqual(v2.planning, { today: null, plans: {} });
});
