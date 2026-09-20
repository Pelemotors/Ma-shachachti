import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { SimulationConfig } from "../config/simulation.config.ts";
import type { ProductAdapter } from "../adapters/product-adapter.ts";
import type { Persona } from "../schemas/persona.schema.ts";
import type { Scenario } from "../schemas/scenario.schema.ts";
import { buildCorrelationId, buildRunId } from "../utils/ids.ts";
import { DeterministicRandom } from "./deterministic-random.ts";
import { VirtualClock } from "./virtual-clock.ts";

export type RunContext = {
  runId: string;
  seed: number;
  environment: string;
  gitSha: string;
  personaId: string;
  scenarioId: string;
  personaVersion: string;
  scenarioVersion: string;
  clock: VirtualClock;
  random: DeterministicRandom;
  adapter: ProductAdapter;
  correlationId: string;
  resultDirectory: string;
  realRunTime: string;
  sequence: number;
};

export function createRunContext(input: {
  config: SimulationConfig;
  gitSha: string;
  persona: Persona;
  scenario: Scenario;
  adapter: ProductAdapter;
  realRunTime: string;
}): RunContext {
  const runId = buildRunId({
    seed: input.config.seed,
    gitSha: input.gitSha,
    personaId: input.persona.id,
    scenarioId: input.scenario.id,
    startedAtReal: input.realRunTime,
  });
  const resultDirectory = join(input.config.resultsDir, runId);
  mkdirSync(join(resultDirectory, "failures"), { recursive: true });
  mkdirSync(join(resultDirectory, "anomalies"), { recursive: true });
  mkdirSync(join(resultDirectory, "snapshots"), { recursive: true });
  mkdirSync(join(resultDirectory, "personas"), { recursive: true });
  return {
    runId,
    seed: input.config.seed,
    environment: input.config.env,
    gitSha: input.gitSha,
    personaId: input.persona.id,
    scenarioId: input.scenario.id,
    personaVersion: input.persona.version,
    scenarioVersion: input.scenario.version,
    clock: new VirtualClock(input.scenario.start, input.scenario.timezone),
    random: new DeterministicRandom(input.config.seed),
    adapter: input.adapter,
    correlationId: buildCorrelationId(runId, 0),
    resultDirectory,
    realRunTime: input.realRunTime,
    sequence: 0,
  };
}

export function nextSequence(ctx: RunContext): number {
  ctx.sequence += 1;
  ctx.correlationId = buildCorrelationId(ctx.runId, ctx.sequence);
  return ctx.sequence;
}
