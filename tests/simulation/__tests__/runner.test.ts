import assert from "node:assert/strict";
import { test } from "node:test";
import { createInMemoryHarnessAdapter } from "../adapters/in-memory-harness-adapter.ts";
import { loadSimulationConfig } from "../config/simulation.config.ts";
import { runSimulation } from "../runner/simulation-runner.ts";
import { samplePersona, sampleScenario } from "./helpers.ts";

test("runner executes ordered events and keeps a stable run id", async () => {
  const result = await runSimulation({
    config: loadSimulationConfig({ env: "test", seed: 42, resultsDir: "test-results/simulation" }),
    gitSha: "deadbeef",
    persona: samplePersona(),
    scenario: sampleScenario(),
    adapter: createInMemoryHarnessAdapter(),
    realRunTime: "2026-09-20T00:00:00.000Z",
  });
  assert.equal(result.timeline.length, 2);
  assert.equal(result.timeline[0]?.sequence, 1);
  assert.equal(result.timeline[1]?.sequence, 2);
  assert.ok(result.timeline.every((row) => row.runId === result.ctx.runId));
  assert.ok(result.timeline[1]!.simulatedAt > result.timeline[0]!.simulatedAt);
});

test("fatal validator failure stays FAIL", async () => {
  const result = await runSimulation({
    config: loadSimulationConfig({ env: "test", seed: 1 }),
    gitSha: "deadbeef",
    persona: samplePersona(),
    scenario: sampleScenario(),
    adapter: createInMemoryHarnessAdapter(),
    realRunTime: "2026-09-20T00:00:00.000Z",
  });
  assert.equal(
    result.timeline.some(
      (row) =>
        row.status === "PASS" &&
        row.validationResults.some((item) => item.status === "FAIL" && item.severity === "fatal"),
    ),
    false,
  );
});
