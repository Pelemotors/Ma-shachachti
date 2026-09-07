import test from "node:test";
import assert from "node:assert/strict";
import { applyActions } from "../lib/engine";
import { emptyState } from "../lib/model";
import {
  applyForecastEvent,
  activeForecasts,
  forecastActionableNow,
} from "../lib/domain/forecast";

const now = new Date("2026-09-08T10:00:00.000+03:00");

test("domain9: forecast needs evidence; correction cancels; not a fact", () => {
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
  const active = activeForecasts(s);
  assert.ok(active.length >= 1);
  assert.ok(active[0]!.learnedIntervalDays != null);
  assert.ok(
    forecastActionableNow(
      active[0]!,
      new Date(active[0]!.expectedWindowStart!),
    ),
  );
  s = applyForecastEvent(s, {
    subject,
    type: "correction",
    occurredAt: now.toISOString(),
  });
  assert.equal(activeForecasts(s).length, 0);
});

test("domain9: structured forecast fact marker updates model via engine", () => {
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
  assert.ok(activeForecasts(s).length >= 1);
});
