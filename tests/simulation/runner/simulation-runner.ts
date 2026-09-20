import { assertSafeEnvironment } from "../config/safety.ts";
import type { SimulationConfig } from "../config/simulation.config.ts";
import type { ProductAdapter } from "../adapters/product-adapter.ts";
import { parsePersona, type Persona } from "../schemas/persona.schema.ts";
import { parseScenario, type Scenario } from "../schemas/scenario.schema.ts";
import type { TimelineEntry } from "../schemas/report.schema.ts";
import type { SimulationSnapshot } from "../schemas/snapshot.schema.ts";
import { writeRunArtifacts } from "../reporting/report-writer.ts";
import {
  behavioralEvaluator,
} from "../evaluators/behavioral.ts";
import { frictionEvaluator } from "../evaluators/friction.ts";
import { planningQualityEvaluator } from "../evaluators/planning-quality.ts";
import { regressionEvaluator } from "../evaluators/regression.ts";
import { repetitionEvaluator } from "../evaluators/repetition.ts";
import { mergeScorecards } from "../evaluators/index.ts";
import { engineValidators } from "../validators/invariants/engine.ts";
import { runValidators } from "../validators/index.ts";
import { createRunContext } from "./run-context.ts";
import { recordPersonaUse } from "./persona-runner.ts";
import { runScenario } from "./scenario-runner.ts";
import { parseEnvironment } from "../config/environments.ts";

export async function runSimulation(input: {
  config: SimulationConfig;
  gitSha: string;
  persona: Persona;
  scenario: Scenario;
  adapter: ProductAdapter;
  realRunTime: string;
}) {
  assertSafeEnvironment(parseEnvironment(input.config.env));
  const persona = parsePersona(input.persona);
  const scenario = parseScenario(input.scenario);
  const ctx = createRunContext({
    config: input.config,
    gitSha: input.gitSha,
    persona,
    scenario,
    adapter: input.adapter,
    realRunTime: input.realRunTime,
  });
  recordPersonaUse(ctx, persona);
  await ctx.adapter.authenticate({});
  const timeline: TimelineEntry[] = [];
  const snapshots: SimulationSnapshot[] = [];
  await runScenario({
    ctx,
    scenario,
    timeline,
    snapshots,
    validators: engineValidators,
  });
  const endValidations = runValidators(engineValidators, "end_of_run", {
    run: ctx,
    timeline,
    snapshots,
  });
  const validations = [...timeline.flatMap((row) => row.validationResults), ...endValidations];
  const scorecard = mergeScorecards([
    behavioralEvaluator.evaluate({ timeline }),
    frictionEvaluator.evaluate({ timeline }),
    repetitionEvaluator.evaluate({ timeline }),
    planningQualityEvaluator.evaluate({ timeline }),
    regressionEvaluator.evaluate({ timeline }),
  ]);
  const summary = writeRunArtifacts({
    ctx,
    timeline,
    validations,
    scorecard,
  });
  return { ctx, timeline, snapshots, validations, scorecard, summary };
}
