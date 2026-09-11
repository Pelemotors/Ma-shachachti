import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseLegacyLists, parseLegacyQuantity, stableLegacyUuid, verifyProductionListShape } from "../lib/legacy-lists.ts";
import { checklistMutationSchema, shoppingMutationSchema } from "../lib/lists.ts";
import { decodeAppRoute, encodeAppRoute } from "../lib/app-route-state.ts";
import { inspectActions } from "../lib/action-schema.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const id = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

function fixture() {
  const shopping = Array.from({ length: 32 }, (_, index) => ({
    id: id(index + 1), title: `פריט ${index}`,
    quantity: index === 0 ? "" : ` ${index + 1} `,
    createdAt: "2026-09-01T10:00:00Z",
    purchasedAt: index % 2 ? "2026-09-02T10:00:00Z" : null,
  }));
  return [
    { owner_id: ownerA, revision: 7, updated_at: "2026-09-03T00:00:00Z", data: {
      shopping,
      checklists: [{ id: id(90), title: "נסיעה", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-02T00:00:00Z",
        items: Array.from({ length: 4 }, (_, index) => ({ id: id(100 + index), text: `פריט ${index}`, order: index, checked: index === 0, createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-02T00:00:00Z" })) }],
    } },
    { owner_id: ownerB, data: { shopping: [{ id: id(80), title: "חלב", quantity: "1", createdAt: "2026-09-01T00:00:00Z", purchasedAt: null }] } },
    { owner_id: id(300), data: {} },
  ];
}

test("pure production fixture parser verifies 33/1/4 and exact fields", () => {
  const parsed = parseLegacyLists(fixture());
  assert.deepEqual(parsed.counts, { shopping: 33, checklists: 1, checklistItems: 4 });
  assert.equal(verifyProductionListShape(fixture()).matches, true);
  assert.equal(parsed.shopping[0]?.id, id(1));
  assert.equal(parsed.shopping[0]?.quantity, 1);
  assert.equal(parsed.shopping[1]?.quantity, 2);
  assert.equal(parsed.shopping[0]?.purchased_at, null);
  assert.equal(parsed.checklists[0]?.items[0]?.checked, true);
});

test("invalid ids map deterministically and guards make missing data a no-op", () => {
  assert.equal(stableLegacyUuid(ownerA, "shopping", 0, "bad"), stableLegacyUuid(ownerA, "shopping", 0, "bad"));
  assert.notEqual(stableLegacyUuid(ownerA, "shopping", 0, "bad"), stableLegacyUuid(ownerA, "shopping", 1, "bad"));
  const missing = stableLegacyUuid(ownerA, "shopping", 3, undefined);
  const jsonNull = stableLegacyUuid(ownerA, "shopping", 3, null);
  assert.equal(missing, jsonNull);
  assert.match(missing, /^[0-9a-f-]{36}$/);
  const parsed = parseLegacyLists([{ owner_id: ownerA, updated_at: "2026-09-03T00:00:00Z", data: {
    shopping: [
      { title: "ללא מזהה", quantity: "2", createdAt: "2026-09-01T00:00:00Z", purchasedAt: null },
      { id: null, title: "מזהה null", quantity: "", createdAt: "2026-09-01T00:00:00Z", purchasedAt: null },
    ],
  } }]);
  assert.equal(parsed.shopping[0]?.id, stableLegacyUuid(ownerA, "shopping", 0, undefined));
  assert.equal(parsed.shopping[1]?.id, stableLegacyUuid(ownerA, "shopping", 1, null));
  assert.equal(parsed.shopping[0]?.quantity, 2);
  assert.equal(parsed.shopping[1]?.quantity, 1);
  assert.deepEqual(parseLegacyLists([{ owner_id: ownerA, data: { shopping: {}, checklists: "bad" } }]).counts,
    { shopping: 0, checklists: 0, checklistItems: 0 });
});

test("legacy quantity accepts trimmed digit strings and safe numbers only", () => {
  assert.equal(parseLegacyQuantity("2"), 2);
  assert.equal(parseLegacyQuantity(" 2 "), 2);
  assert.equal(parseLegacyQuantity(2), 2);
  for (const value of ["", "2.5", "-2", "1000", "abc", null, undefined, 2.5]) {
    assert.equal(parseLegacyQuantity(value), 1);
  }
});

test("migration is immutable, idempotent, guarded and fully owner-RLS protected", () => {
  const sql = read("../database/migrations/20260912_lean_shopping_checklists.sql");
  assert.match(sql, /on conflict do nothing/g);
  assert.match(sql, /jsonb_typeof\(shopping\) = 'array'/);
  assert.match(sql, /jsonb_typeof\(item_value -> 'quantity'\) in \('number', 'string'\)/);
  assert.match(sql, /btrim\(item_value ->> 'quantity'\) ~ '\^\[0-9\]\+\$'/);
  assert.match(sql, /language plpgsql immutable\s+set search_path = ''\s+as \$\$\s+declare raw text;\s+begin\s+raw := ''/s);
  assert.doesNotMatch(sql, /legacy_uuid_or_stable\([\s\S]*?\) returns uuid\s+language plpgsql immutable strict/);
  assert.match(sql, /to_regclass\('public\.app_states'\) is null/);
  assert.doesNotMatch(sql, /update\s+public\.app_states|delete\s+from\s+public\.app_states/i);
  for (const table of ["shopping_items", "checklists", "checklist_items"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /for update to authenticated using .*with check/s);
  assert.match(sql, /revoke all on public\.shopping_items, public\.checklists, public\.checklist_items from anon/);
});

test("API schemas reject malformed payloads and routes scope ownership", () => {
  assert.equal(shoppingMutationSchema.safeParse({ action: "add", title: "חלב", quantity: 2 }).success, true);
  assert.equal(shoppingMutationSchema.safeParse({ action: "toggle", id: ownerA, purchased: true, user_id: ownerB }).success, false);
  assert.equal(checklistMutationSchema.safeParse({ action: "item.toggle", checklist_id: ownerA, id: ownerB, checked: true }).success, true);
  for (const path of ["../app/api/shopping/route.ts", "../app/api/checklists/route.ts", "../lib/lists.ts"]) {
    const source = read(path);
    assert.match(source, /userId/);
    assert.doesNotMatch(source, /app_states|revision|use-household|lib\/engine/);
  }
  assert.match(read("../lib/lists.ts"), /\.eq\("user_id", userId\)/g);
});

test("checklist URL deep link round trips and invalid id falls back", () => {
  const href = encodeAppRoute({ view: "checklists", date: null, sessionId: null, checklistId: ownerA });
  assert.equal(decodeAppRoute(href.split("?")[1] ?? "").checklistId, ownerA);
  assert.deepEqual(decodeAppRoute("view=checklists&checklist=bad"), {
    view: "checklists", date: null, sessionId: null, checklistId: null,
  });
  assert.match(read("../components/lean-lists.tsx"), /!next\.some\(\(list\) => list\.id === props\.activeId\)/);
});

test("Agent exposes actual list actions with ownership context and atomic receipts", () => {
  const action = {
    type: "checklist.item.toggle", id: ownerB, checklist_id: ownerA, checked: true,
    title: null, notes: null, due_on: null, due_time: null, due_patch: null,
    reminder_enabled: null, reminder_at: null, reminder_at_patch: null,
    reminder_offset_minutes: null, reminder_patch: null, plan_patch: null,
    planned_date: null, planned_start_time: null, planned_end_time: null,
    kind: null, content: null, confidence: null, silent: null, text: null,
    quantity: null, purchased: null,
  };
  assert.equal(inspectActions([action]).accepted[0]?.type, "checklist.item.toggle");
  const capabilities = read("../lib/agent/capabilities.ts");
  assert.match(capabilities, /shopping\.add/);
  assert.match(capabilities, /checklist\.item\.toggle/);
  const rpc = read("../database/migrations/20260912_lean_agent_foundation.sql");
  assert.match(rpc, /checklist_id = nullif\(p_action ->> 'checklist_id'/);
  assert.match(rpc, /user_id = v_user_id/g);
  assert.match(read("../app/api/chat/route.ts"), /loadShopping\(db, userId\)/);
  assert.match(read("../app/api/chat/route.ts"), /loadChecklists\(db, userId\)/);
});

test("list UI shares optimistic rollback/dedupe layer and has no keyword router", () => {
  const ui = read("../components/lean-lists.tsx");
  assert.match(ui, /props\.mutations\.run/g);
  assert.match(ui, /shopping:toggle:/);
  assert.match(ui, /checklist:item:reorder:/);
  const combined = `${read("../app/api/chat/route.ts")}\n${read("../lib/agent/turn.ts")}`;
  assert.doesNotMatch(combined, /includes\(["'][^"']*(קניות|רשימה)|keyword|phrase router/i);
});
