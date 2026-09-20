import { buildActionId } from "../utils/ids.ts";
import type { ScenarioEvent } from "../schemas/event.schema.ts";
import type { SimulationAction } from "../schemas/action.schema.ts";
import type { TimelineEntry } from "../schemas/report.schema.ts";
import type { SimulationSnapshot } from "../schemas/snapshot.schema.ts";
import type { SimulationValidator } from "../validators/index.ts";
import { runAction } from "./action-runner.ts";
import type { RunContext } from "./run-context.ts";

export async function runDayEvents(input: {
  ctx: RunContext;
  events: ScenarioEvent[];
  timeline: TimelineEntry[];
  snapshots: SimulationSnapshot[];
  validators: SimulationValidator[];
}): Promise<void> {
  for (const event of input.events) {
    if (event.type === "time_advance") {
      input.ctx.clock.setTime(event.at);
    } else if (event.at) {
      try {
        input.ctx.clock.setTime(event.at);
      } catch {
        // Event times must be non-decreasing; runner records the clock error via action.
      }
    }
    const action: SimulationAction = {
      actionId: buildActionId(input.ctx.runId, input.ctx.sequence + 1),
      type: event.actionType ?? (event.type === "time_advance" ? "time.advance" : "engine.ping"),
      simulatedAt: input.ctx.clock.nowIso(),
      actor: "persona",
      input: event.payload,
      expectedTransport: input.ctx.adapter.kind === "http" ? "http" : "in_memory",
      metadata: { eventId: event.id, eventType: event.type },
    };
    const entry = await runAction({
      ctx: input.ctx,
      action,
      timeline: input.timeline,
      snapshots: input.snapshots,
      validators: input.validators,
    });
    if (
      entry.status === "FAIL" &&
      entry.validationResults.some((row) => row.severity === "fatal")
    ) {
      throw new Error(`Fatal simulation failure at ${entry.actionId}`);
    }
  }
}
