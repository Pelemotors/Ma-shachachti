import type { Scenario } from "../schemas/scenario.schema.ts";
import type { TimelineEntry } from "../schemas/report.schema.ts";
import type { SimulationSnapshot } from "../schemas/snapshot.schema.ts";
import type { SimulationValidator } from "../validators/index.ts";
import { runDayEvents } from "./day-runner.ts";
import type { RunContext } from "./run-context.ts";

export async function runScenario(input: {
  ctx: RunContext;
  scenario: Scenario;
  timeline: TimelineEntry[];
  snapshots: SimulationSnapshot[];
  validators: SimulationValidator[];
}): Promise<void> {
  const ordered = [...input.scenario.events].sort((a, b) => a.at.localeCompare(b.at));
  await runDayEvents({
    ctx: input.ctx,
    events: ordered,
    timeline: input.timeline,
    snapshots: input.snapshots,
    validators: input.validators,
  });
}
