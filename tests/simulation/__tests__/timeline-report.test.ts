import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createInMemoryHarnessAdapter } from "../adapters/in-memory-harness-adapter.ts";
import { loadSimulationConfig } from "../config/simulation.config.ts";
import { runSimulation } from "../runner/simulation-runner.ts";
import { samplePersona, sampleScenario } from "./helpers.ts";

test("timeline is sequential JSONL and reporter writes required files", async () => {
  const result = await runSimulation({
    config: loadSimulationConfig({ env: "test", seed: 99 }),
    gitSha: "cafe1234",
    persona: samplePersona(),
    scenario: sampleScenario(),
    adapter: createInMemoryHarnessAdapter(),
    realRunTime: "2026-09-20T00:00:00.000Z",
  });
  const dir = result.ctx.resultDirectory;
  for (const name of [
    "run.json",
    "summary.json",
    "summary.md",
    "scorecard.json",
    "timeline.jsonl",
  ]) {
    assert.equal(existsSync(join(dir, name)), true, name);
  }
  const lines = readFileSync(join(dir, "timeline.jsonl"), "utf8").trim().split("\n");
  assert.equal(lines.length, result.timeline.length);
  assert.equal(JSON.parse(lines[0] ?? "{}").sequence, 1);
});
