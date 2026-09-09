import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emptyState } from "../lib/model";
import { applyActions } from "../lib/engine";
import { buildAgentContext } from "../lib/domain/agent-context";
import { classifyActionPolicy, partitionActionsByPolicy } from "../lib/agent/schema";
import {
  FORECAST_USER_INTENT,
  FORECAST_USER_INTENT_LABEL,
} from "../lib/agent/forecast-intent";
import { shoppingFactualEvents, shoppingPurchaseHistory } from "../lib/domain/factual-history";

const NOW = new Date("2026-09-09T12:00:00+03:00");

test("FORECAST evidence: shopping add/check/remove writes factual events, not forecast scores", () => {
  let state = emptyState();
  state = applyActions(state, [{ type: "shopping.add", title: "חלב" }], NOW);
  const added = state.shopping[0]!;
  const addedEvents = shoppingFactualEvents(state);
  assert.equal(addedEvents.at(-1)?.type, "shopping.item_added");
  assert.equal(addedEvents.at(-1)?.entityId, added.id);
  assert.equal(addedEvents.at(-1)?.payload?.title, "חלב");

  const later = new Date("2026-09-23T12:00:00+03:00");
  state = applyActions(
    state,
    [{ type: "shopping.check", id: added.id, checked: true }],
    later,
    true,
  );
  assert.equal(state.learning.filter((row) => row.kind === "forecast").length, 0);
  assert.equal(shoppingPurchaseHistory(state).length, 1);
  assert.equal(shoppingPurchaseHistory(state)[0]?.purchasedAt, later.toISOString());
  const checked = shoppingFactualEvents(state).find(
    (event) => event.type === "shopping.item_checked",
  );
  assert.equal(checked?.payload?.checked, true);

  state = applyActions(
    state,
    [{ type: "shopping.remove", id: added.id }],
    later,
    true,
  );
  assert.equal(state.shopping.length, 0);
  assert.ok(
    shoppingFactualEvents(state).some((event) => event.type === "shopping.item_removed"),
  );
});

test("FORECAST evidence: purchased history reaches Agent context without a forecast rule", () => {
  let state = emptyState();
  state = applyActions(state, [{ type: "shopping.add", title: "לחם" }], NOW);
  const id = state.shopping[0]!.id;
  state = applyActions(
    state,
    [{ type: "shopping.check", id, checked: true }],
    NOW,
  );
  const ctx = buildAgentContext(state, { now: NOW });
  assert.equal(ctx.shopping.length, 0);
  assert.equal(ctx.shoppingHistory.length, 1);
  assert.equal(ctx.shoppingHistory[0]?.title, "לחם");
  assert.equal(ctx.shoppingEvents.length, 2);
  assert.equal("expectedWindowStart" in (ctx.shoppingHistory[0] ?? {}), false);
});

test("FORECAST-03: manual intent is a chat message, not a Forecast Engine", () => {
  assert.equal(FORECAST_USER_INTENT_LABEL, "מה אפשר לחזות לי?");
  assert.match(FORECAST_USER_INTENT, /היסטוריה/);
  const home = readFileSync("components/home-app.tsx", "utf8");
  assert.match(home, /FORECAST_USER_INTENT/);
  assert.match(home, /chat\.sendMessage\(FORECAST_USER_INTENT\)/);
  assert.equal(home.includes("ForecastEngine"), false);
  const agentDir = readFileSync("lib/agent/forecast-intent.ts", "utf8");
  assert.match(agentDir, /not a Forecast Engine/i);
});

test("FORECAST-04: shopping.add follows current policy; proposal actions are not auto", () => {
  const add = { type: "shopping.add" as const, title: "חלב" };
  assert.equal(classifyActionPolicy(add), "auto");
  const split = partitionActionsByPolicy([add]);
  assert.equal(split.auto[0]?.type, "shopping.add");
  assert.equal(split.proposal.length, 0);

  const createTask = {
    type: "task.create" as const,
    task: { title: "לקנות חלב", kind: "task" as const },
  };
  assert.equal(classifyActionPolicy(createTask), "proposal");
  const mixed = partitionActionsByPolicy([add, createTask]);
  assert.ok(mixed.proposal.some((action) => action.type === "task.create"));
});

test("FORECAST: no shopping-recurrence classifier was added to the live agent path", () => {
  const orch = readFileSync("lib/agent/orchestration.ts", "utf8");
  assert.equal(orch.includes("Forecast Mode"), false);
  assert.equal(orch.includes("כל 14 יום"), false);
  const intent = readFileSync("lib/agent/forecast-intent.ts", "utf8");
  assert.equal(intent.includes("recurrence classifier"), false);
});
