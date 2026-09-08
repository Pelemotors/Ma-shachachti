import test from "node:test";
import assert from "node:assert/strict";
import { applyActions } from "../lib/engine";
import { emptyState } from "../lib/model";
import {
  updateDurationModel,
  recordTaskDurationSample,
  MIN_DURATION_SAMPLES,
} from "../lib/domain/learning/pace";

const now = new Date("2026-09-08T10:00:00.000+03:00");

test("domain8: duration learning needs minimum samples and resists outlier", () => {
  let model = updateDurationModel(null, {
    minutes: 10,
    at: now.toISOString(),
    source: "completion",
  });
  assert.equal(model.typicalMinutes, null);
  for (const m of [12, 11, 13, 12, 90]) {
    model = updateDurationModel(model, {
      minutes: m,
      at: now.toISOString(),
      source: "completion",
    });
  }
  assert.ok(model.count >= MIN_DURATION_SAMPLES);
  assert.ok(model.typicalMinutes != null && model.typicalMinutes < 40);
});

test("domain8: explicit duration beats later weak samples", () => {
  let s = emptyState();
  s = applyActions(
    s,
    [{ type: "task.create", task: { title: "קיפול", kind: "task" } }],
    now,
  );
  const task = s.tasks[0]!;
  s = recordTaskDurationSample(s, task, 15, now, { explicit: true });
  s = recordTaskDurationSample(s, task, 90, now, { explicit: false });
  const hit = s.learning.find((x) => x.kind === "duration");
  assert.equal(hit?.payload.source, "explicit");
});
