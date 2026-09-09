import test from "node:test";
import assert from "node:assert/strict";
import { applyActions } from "../lib/engine";
import { emptyState } from "../lib/model";
import {
  applyForecastEvent,
  activeForecasts,
  forecastActionableNow,
  OLD_FORECAST_REASONING_PATH,
} from "../lib/domain/forecast";
import { buildSharedDecisionContext } from "../lib/domain/decision-context";
import { rankForgotten } from "../lib/domain/forgotten";
import { buildAgentContext } from "../lib/domain/agent-context";
import { evaluateNotificationPolicy } from "../lib/domain/notifications/policy";

const now = new Date("2026-09-08T10:00:00.000+03:00");

test("OLD_FORECAST_REASONING_PATH is DISCONNECTED", () => {
  assert.equal(OLD_FORECAST_REASONING_PATH, "DISCONNECTED");
});

test("domain9: inventory events are stored without semantic windows or active forecasts", () => {
  let s = emptyState();
  const subject = "dog_food";
  for (const days of [0, 30, 60, 90]) {
    const at = new Date(now.getTime() + days * 86400000).toISOString();
    s = applyForecastEvent(s, {
      subject,
      type: "replenishment",
      occurredAt: at,
    });
  }
  const row = s.learning.find((x) => x.kind === "forecast");
  assert.ok(row);
  assert.ok(Array.isArray(row!.payload.events));
  assert.equal((row!.payload.events as unknown[]).length, 4);
  assert.equal(row!.payload.expectedWindowStart, undefined);
  assert.equal(row!.payload.learnedIntervalDays, undefined);
  assert.equal(activeForecasts(s).length, 0);
  assert.equal(
    forecastActionableNow({
      id: "x",
      subject,
      type: "consumption",
      expectedWindowStart: now.toISOString(),
      expectedWindowEnd: now.toISOString(),
      confidence: 0.99,
      evidenceCount: 4,
      lastEventAt: now.toISOString(),
      learnedIntervalDays: 30,
      source: "learned",
      status: "active",
      recheckAt: now.toISOString(),
      expiresAt: now.toISOString(),
    }),
    false,
  );
});

test("domain9: structured forecast fact marker records events only", () => {
  let s = emptyState();
  for (const days of [0, 28, 56, 84]) {
    const at = new Date(now.getTime() + days * 86400000);
    s = applyActions(
      s,
      [
        {
          type: "fact.add",
          text: "forecast:replenishment:dog_food",
          kind: "inference",
          expiresAt: null,
        },
      ],
      at,
    );
  }
  assert.equal(activeForecasts(s).length, 0);
  assert.equal(
    s.learning.filter((row) => row.kind === "forecast").length,
    1,
  );
});

test("OLD_FORECAST_REASONING_PATH: UI/agent/notification consumers get no code forecast", () => {
  let s = emptyState();
  s = applyForecastEvent(s, {
    subject: "milk",
    type: "replenishment",
    occurredAt: now.toISOString(),
  });
  const ctx = buildSharedDecisionContext(s, now);
  assert.deepEqual(ctx.actionableForecasts, []);
  assert.equal(
    rankForgotten(s, now).some((i) => i.reasons.includes("forecast")),
    false,
  );
  const agent = buildAgentContext(s, { now });
  const forecast = agent.learning.find((row) => row.kind === "forecast");
  assert.ok(forecast);
  assert.equal("expectedWindowStart" in (forecast.payload as object), false);
  assert.equal("confidence" in forecast, false);
  const notify = evaluateNotificationPolicy({ now });
  assert.notEqual(notify.reason, "forecast_digest");
});
