import assert from "node:assert/strict";
import { test } from "node:test";
import {
  factEntityKey,
  isDayScopedTemporalContent,
  reconcileMemoryWrite,
} from "../lib/memory-display.ts";
import { selectPersonalMemories } from "../lib/agent/context/memory-select.ts";
import type { MemoryRow } from "../lib/types.ts";
import {
  extractShoppingAddTitles,
  ensureShoppingPurchaseOrCancel,
  constrainMemoryWritesForDurability,
} from "../lib/agent/prepare-actions.ts";
import {
  isPlausibleShoppingTitle,
  normalizeShoppingTitle,
  reconcileActions,
} from "../lib/agent/reconcile.ts";
import type { AgentAction } from "../lib/types.ts";

function blankAction(partial: Partial<AgentAction> & Pick<AgentAction, "type">): AgentAction {
  return {
    id: null,
    title: null,
    notes: null,
    due_on: null,
    due_time: null,
    due_patch: null,
    reminder_enabled: null,
    reminder_at: null,
    reminder_at_patch: null,
    reminder_offset_minutes: null,
    reminder_patch: null,
    plan_patch: null,
    planned_date: null,
    planned_start_time: null,
    planned_end_time: null,
    kind: null,
    content: null,
    confidence: null,
    silent: null,
    ...partial,
  };
}

function mem(partial: Partial<MemoryRow> & { id: string; content: string }): MemoryRow {
  return {
    kind: "fact",
    confidence: "medium",
    source: "user",
    seen_at: "2026-09-20T10:00:00.000Z",
    created_at: "2026-09-20T10:00:00.000Z",
    updated_at: "2026-09-20T10:00:00.000Z",
    active: true,
    scope: "always",
    category: "fact",
    ...partial,
  };
}

test("factEntityKey groups doctor pickup corrections", () => {
  assert.equal(
    factEntityKey("דני לוקח את תום לרופא"),
    factEntityKey("עזבי, אני לוקחת את תום לרופא"),
  );
});

test("reconcileMemoryWrite supersedes contradicting fact on same entity", () => {
  const decision = reconcileMemoryWrite({
    content: "נועה לוקחת את תום לרופא",
    kind: "fact",
    existing: [
      mem({
        id: "old",
        content: "דני לוקח את תום לרופא",
      }),
    ],
  });
  assert.equal(decision.mode, "update");
  if (decision.mode === "update") {
    assert.equal(decision.id, "old");
  }
});

test("selectPersonalMemories drops expired temporary and keeps durable", () => {
  const now = new Date("2026-09-22T10:00:00.000Z");
  const selected = selectPersonalMemories({
    now,
    memories: [
      mem({
        id: "tmp",
        content: "מחר אל תעמיסי לי, רק מה שחייב",
        scope: "temporary",
        category: "exception",
        updated_at: "2026-09-19T10:00:00.000Z",
        created_at: "2026-09-19T10:00:00.000Z",
      }),
      mem({
        id: "dog",
        content: "צ׳ארלי הוא הכלב של המשפחה",
        updated_at: "2026-09-21T10:00:00.000Z",
      }),
    ],
  });
  assert.equal(selected.some((row) => row.id === "tmp"), false);
  assert.equal(selected.some((row) => row.id === "dog"), true);
});

test("extractShoppingAddTitles splits multi-item buy lists", () => {
  assert.deepEqual(extractShoppingAddTitles("צריך טיטולים וקפה"), [
    "טיטולים",
    "קפה",
  ]);
  assert.deepEqual(extractShoppingAddTitles("נגמר קפה"), ["קפה"]);
});

test("ensureShoppingPurchaseOrCancel toggles existing items from purchase utterance", () => {
  const actions = ensureShoppingPurchaseOrCancel({
    actions: [blankAction({ type: "shopping.add", title: "דני קנה חלב לחם וסבון כביסה" })],
    shopping: [
      {
        id: "a",
        title: "חלב",
        quantity: 1,
        purchased_at: null,
        order_index: 0,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "b",
        title: "לחם",
        quantity: 1,
        purchased_at: null,
        order_index: 1,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "c",
        title: "סבון כביסה",
        quantity: 1,
        purchased_at: null,
        order_index: 2,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    userMessage: "דני קנה חלב, לחם וסבון כביסה",
  });
  assert.ok(actions.every((action) => action.type === "shopping.toggle"));
  assert.equal(actions.length, 3);
  assert.ok(actions.every((action) => action.purchased === true));
});

test("completion of short shopping noun toggles even with extra words", () => {
  const actions = reconcileActions({
    actions: [
      blankAction({
        type: "shopping.update",
        id: "shop-1",
        title: "חלב",
      }),
    ],
    openTasks: [],
    shopping: [
      {
        id: "shop-1",
        title: "חלב",
        quantity: 1,
        purchased_at: null,
        order_index: 0,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    userMessage: "קניתי חלב לבדיקת smoke",
  });
  assert.equal(actions[0]?.type, "shopping.toggle");
  assert.equal(actions[0]?.purchased, true);
});

test("constrainMemoryWritesForDurability drops silent preference on ephemeral day", () => {
  const actions = constrainMemoryWritesForDurability({
    actions: [
      blankAction({
        type: "memory.upsert",
        content: "נועה תמיד רוצה לו״ז קל",
        kind: "preference",
        silent: true,
      }),
    ],
    userMessage: "מחר אל תעמיסי לי, רק מה שחייב",
  });
  assert.equal(actions.length, 0);
});

test("RF-06 day-scoped cooking statement is not durable memory", () => {
  assert.equal(isDayScopedTemporalContent("היום לא מבשלים"), true);
  assert.equal(
    isDayScopedTemporalContent(
      JSON.stringify({ v: 1, kind: "event", text: "היום לא מבשלים, מזמינים פיצה" }),
    ),
    true,
  );
  const dropped = constrainMemoryWritesForDurability({
    actions: [
      blankAction({
        type: "memory.upsert",
        content: JSON.stringify({
          v: 1,
          kind: "event",
          text: "היום לא מבשלים, מזמינים פיצה",
        }),
        kind: "fact",
      }),
    ],
    userMessage: "היום לא מבשלים, מזמינים פיצה",
  });
  assert.equal(dropped.length, 0);
  const decision = reconcileMemoryWrite({
    content: "היום לא מבשלים",
    kind: "fact",
    existing: [],
  });
  assert.equal(decision.mode, "exception");
  assert.equal(decision.scope, "temporary");
});

test("RF-07 rejects sentence-like shopping garbage titles", () => {
  assert.equal(isPlausibleShoppingTitle("קפה"), true);
  assert.equal(isPlausibleShoppingTitle("סבון כביסה"), true);
  assert.equal(isPlausibleShoppingTitle("לקבוע למאיה רופא שיניים"), false);
  assert.equal(isPlausibleShoppingTitle("להזמין אוכל לכלב"), false);
  assert.equal(isPlausibleShoppingTitle("ומתישהו לסדר את מגירת התרופות"), false);
  assert.equal(isPlausibleShoppingTitle("לבדוק מתי הטסט של הרכב"), false);
  assert.equal(isPlausibleShoppingTitle("נראה לי בסוף החודש"), false);
  assert.equal(normalizeShoppingTitle("צריך קפה"), "קפה");

  const actions = reconcileActions({
    actions: [
      blankAction({ type: "shopping.add", title: "לקבוע למאיה רופא שיניים" }),
      blankAction({ type: "shopping.add", title: "חלב" }),
    ],
    openTasks: [],
    shopping: [],
    userMessage: "צריך לקבוע למאיה רופא שיניים וגם חלב",
  });
  assert.equal(actions.length, 1);
  assert.equal(actions[0]?.title, "חלב");
});
