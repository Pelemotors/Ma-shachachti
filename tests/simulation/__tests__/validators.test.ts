import assert from "node:assert/strict";
import { test } from "node:test";
import { result, runValidators, type SimulationValidator } from "../validators/index.ts";
import { engineValidators } from "../validators/invariants/engine.ts";
import { createRunContext } from "../runner/run-context.ts";
import { loadSimulationConfig } from "../config/simulation.config.ts";
import { createInMemoryHarnessAdapter } from "../adapters/in-memory-harness-adapter.ts";
import { samplePersona, sampleScenario } from "./helpers.ts";

test("validator pipeline can pass fail and skip", () => {
  const probe: SimulationValidator = {
    id: "probe",
    category: "engine",
    severity: "info",
    when: "after_action",
    validate() {
      return result(this, "SKIP", "not applicable", { evidence: { why: "demo" } });
    },
  };
  const rows = runValidators([probe], "after_action", {
    run: createRunContext({
      config: loadSimulationConfig({ env: "test", seed: 1 }),
      gitSha: "x",
      persona: samplePersona(),
      scenario: sampleScenario(),
      adapter: createInMemoryHarnessAdapter(),
      realRunTime: "2026-09-20T00:00:00.000Z",
    }),
    timeline: [],
    snapshots: [],
  });
  assert.equal(rows[0]?.status, "SKIP");
  assert.equal(rows[0]?.evidence.why, "demo");
  assert.ok(engineValidators.length >= 8);
});
