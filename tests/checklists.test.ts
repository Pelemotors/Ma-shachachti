import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, migrateState } from "../lib/model";
import { applyActions, requiresConfirmation } from "../lib/engine";
import { classifyActionPolicy, partitionActionsByPolicy } from "../lib/agent/schema";
import { AGENT_CAPABILITY_TYPES } from "../lib/agent/capabilities";
import { buildAgentContext } from "../lib/domain/agent-context";
import { executeDeepAccess } from "../lib/agent/deep-access";
import { buildEntityIndex } from "../lib/agent/entity-index";
import { filterReferentialActions } from "../lib/agent/referential-integrity";
import { PERSONAL_CHECKLIST_FULL_CONTEXT_LIMIT } from "../lib/domain/checklists";

const NOW = new Date("2026-09-09T12:00:00+03:00");
const ID = "11111111-1111-4111-8111-111111111111";
const ITEM = "22222222-2222-4222-8222-222222222222";
const ITEM_B = "33333333-3333-4333-8333-333333333333";

function createTravel(state = emptyState()) {
  return applyActions(
    state,
    [
      {
        type: "checklist.create",
        id: ID,
        title: "נסיעה לחו״ל",
        items: [
          { id: ITEM, text: "דרכון" },
          { id: ITEM_B, text: "מטענים" },
        ],
      },
    ],
    NOW,
    true,
  );
}

test("CHECKLIST-01: manual create persists across reload", () => {
  const state = createTravel();
  assert.equal(state.checklists.length, 1);
  const reloaded = migrateState(JSON.parse(JSON.stringify(state)));
  assert.equal(reloaded.checklists[0]?.title, "נסיעה לחו״ל");
  assert.equal(reloaded.checklists[0]?.items.length, 2);
});

test("CHECKLIST-02: agent create is proposal-only before confirmation", () => {
  const action = {
    type: "checklist.create" as const,
    title: "יציאה עם תינוק",
    items: [{ text: "חיתולים" }],
  };
  assert.equal(classifyActionPolicy(action), "proposal");
  const split = partitionActionsByPolicy([action]);
  assert.equal(split.auto.length, 0);
  assert.equal(split.proposal[0]?.type, "checklist.create");
  assert.throws(() => applyActions(emptyState(), [action], NOW, false));
  const saved = applyActions(emptyState(), [action], NOW, true);
  assert.equal(saved.checklists.length, 1);
});

test("CHECKLIST-03: add item uses existing checklist id and does not duplicate", () => {
  let state = createTravel();
  state = applyActions(
    state,
    [
      {
        type: "checklist.item.add",
        checklistId: ID,
        text: "כבל טעינה",
      },
    ],
    NOW,
    true,
  );
  assert.equal(state.checklists.length, 1);
  assert.equal(state.checklists[0]?.items.length, 3);
  assert.ok(state.checklists[0]?.items.some((item) => item.text === "כבל טעינה"));
});

test("CHECKLIST-04: generic item add has no taxonomy capability", () => {
  assert.ok(AGENT_CAPABILITY_TYPES.includes("checklist.item.add"));
  assert.equal(
    AGENT_CAPABILITY_TYPES.includes("createBabyChecklist" as never),
    false,
  );
  assert.equal(
    AGENT_CAPABILITY_TYPES.includes("travelChecklist" as never),
    false,
  );
  assert.equal(
    AGENT_CAPABILITY_TYPES.includes("suggestChecklistItems" as never),
    false,
  );
});

test("CHECKLIST-05: reset unchecks every item", () => {
  let state = createTravel();
  state = applyActions(
    state,
    [
      {
        type: "checklist.item.toggle",
        checklistId: ID,
        itemId: ITEM,
        checked: true,
      },
    ],
    NOW,
  );
  assert.equal(state.checklists[0]?.items.find((item) => item.id === ITEM)?.checked, true);
  state = applyActions(state, [{ type: "checklist.reset", id: ID }], NOW, true);
  assert.ok(state.checklists[0]?.items.every((item) => item.checked === false));
});

test("CHECKLIST-06: reorder is persisted", () => {
  let state = createTravel();
  state = applyActions(
    state,
    [
      {
        type: "checklist.item.reorder",
        checklistId: ID,
        itemIds: [ITEM_B, ITEM],
      },
    ],
    NOW,
    true,
  );
  const ordered = state.checklists[0]!.items
    .slice()
    .sort((a, b) => a.order - b.order);
  assert.equal(ordered[0]?.id, ITEM_B);
  assert.equal(ordered[1]?.id, ITEM);
});

test("CHECKLIST-07: checklists live in owner AppState, not a shared shadow copy", () => {
  const a = createTravel();
  const b = emptyState();
  assert.equal(a.checklists.length, 1);
  assert.equal(b.checklists.length, 0);
  assert.equal(a.personalAgentGuideHistory.length, 0);
});

test("CHECKLIST-08: new session context still sees the checklist", () => {
  const state = migrateState(JSON.parse(JSON.stringify(createTravel())));
  const ctx = buildAgentContext(state, { now: NOW });
  assert.equal(ctx.personalChecklists.presentation, "full");
  assert.equal(ctx.personalChecklists.index[0]?.id, ID);
  assert.equal(ctx.personalChecklists.full[0]?.title, "נסיעה לחו״ל");
  const deep = executeDeepAccess(state, {
    tool: "state.get_checklist",
    entityId: ID,
  });
  assert.equal(deep.ok, true);
});

test("CHECKLIST-09: 100 checklists stay as index + deep access", () => {
  let state = emptyState();
  const actions = Array.from({ length: 100 }, (_, i) => ({
    type: "checklist.create" as const,
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`,
    title: `רשימה ${i + 1}`,
    items: [{ text: "פריט" }],
  }));
  const first = actions.slice(0, 50);
  const second = actions.slice(50);
  state = applyActions(state, first, NOW, true);
  state = applyActions(state, second, NOW, true);
  assert.equal(state.checklists.length, 100);
  assert.ok(100 > PERSONAL_CHECKLIST_FULL_CONTEXT_LIMIT);
  const ctx = buildAgentContext(state, { now: NOW });
  assert.equal(ctx.personalChecklists.presentation, "index");
  assert.equal(ctx.personalChecklists.full.length, 0);
  assert.equal(ctx.personalChecklists.index.length, 100);
  const index = buildEntityIndex(state, NOW);
  assert.equal(index.personalChecklists.total, 100);
  assert.equal(index.personalChecklists.entries.length, 100);
  const firstId = state.checklists[0]!.id;
  const deep = executeDeepAccess(state, {
    tool: "state.get_entity",
    entityId: firstId,
  });
  assert.equal(deep.ok, true);
  assert.equal((deep.data as { kind: string }).kind, "checklist");
});

test("checklist delete requires confirmation; toggle does not", () => {
  assert.equal(
    requiresConfirmation([{ type: "checklist.delete", id: ID }]),
    true,
  );
  assert.equal(
    classifyActionPolicy({
      type: "checklist.item.toggle",
      checklistId: ID,
      itemId: ITEM,
      checked: true,
    }),
    "auto",
  );
});

test("checklist item actions without an id are rejected; same-batch create id is kept", () => {
  const missing = filterReferentialActions(emptyState(), [
    { type: "checklist.item.add", checklistId: ID, text: "מטענים" },
  ]);
  assert.equal(missing.kept.length, 0);
  const together = filterReferentialActions(emptyState(), [
    { type: "checklist.create", id: ID, title: "טיסה" },
    { type: "checklist.item.add", checklistId: ID, text: "מטענים" },
  ]);
  assert.equal(together.rejected.length, 0);
  assert.equal(together.kept.length, 2);
});
