import assert from "node:assert/strict";
import { test } from "node:test";
import { ProductionGuardError, assertSafeEnvironment } from "../config/safety.ts";
import { loadSimulationConfig } from "../config/simulation.config.ts";

test("production environment is rejected", () => {
  assert.throws(() => assertSafeEnvironment("production"), ProductionGuardError);
  const previous = process.env.SIMULATION_ENV;
  process.env.SIMULATION_ENV = "production";
  assert.throws(() => loadSimulationConfig(), ProductionGuardError);
  if (previous === undefined) delete process.env.SIMULATION_ENV;
  else process.env.SIMULATION_ENV = previous;
});

test("local environment is accepted", () => {
  const config = loadSimulationConfig({ env: "local", seed: 7 });
  assert.equal(config.env, "local");
  assert.equal(config.seed, 7);
});
