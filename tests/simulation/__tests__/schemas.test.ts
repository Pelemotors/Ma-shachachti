import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePersona } from "../schemas/persona.schema.ts";
import { parseScenario } from "../schemas/scenario.schema.ts";
import { parseSimulationAction } from "../schemas/action.schema.ts";
import { parseSnapshot, SNAPSHOT_SCHEMA_VERSION } from "../schemas/snapshot.schema.ts";
import { samplePersona, sampleScenario } from "./helpers.ts";

test("valid persona and scenario parse", () => {
  assert.equal(parsePersona(samplePersona()).id, "harness-probe");
  assert.equal(parseScenario(sampleScenario()).events.length, 2);
});

test("invalid persona and scenario are rejected", () => {
  assert.throws(() => parsePersona({ id: "Nope" }));
  assert.throws(() => parseScenario({ id: "x" }));
});

test("action and snapshot validation", () => {
  const action = parseSimulationAction({
    actionId: "a1",
    type: "engine.ping",
    simulatedAt: "2026-09-21T05:00:00.000Z",
    actor: "persona",
  });
  assert.equal(action.expectedTransport, "in_memory");
  const snapshot = parseSnapshot({
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    snapshotId: "s1",
    runId: "r1",
    sequence: 1,
    simulatedAt: "2026-09-21T05:00:00.000Z",
    phase: "after",
  });
  assert.equal(snapshot.tasks.length, 0);
  assert.throws(() => parseSnapshot({ snapshotId: "bad" }));
});
