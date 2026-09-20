import { executeRegisteredAction } from "../actions/index.ts";
import "../actions/register-all.ts";
import { createSnapshot, writeSnapshot } from "../snapshots/snapshot-manager.ts";
import type { SimulationAction } from "../schemas/action.schema.ts";
import type { TimelineEntry } from "../schemas/report.schema.ts";
import { runValidators, type SimulationValidator } from "../validators/index.ts";
import { nextSequence, type RunContext } from "./run-context.ts";
import type { SimulationSnapshot } from "../schemas/snapshot.schema.ts";
import { logSimulation } from "../utils/logger.ts";

export async function runAction(input: {
  ctx: RunContext;
  action: SimulationAction;
  timeline: TimelineEntry[];
  snapshots: SimulationSnapshot[];
  validators: SimulationValidator[];
}): Promise<TimelineEntry> {
  const sequence = nextSequence(input.ctx);
  const started = Date.now();
  const beforeState = await input.ctx.adapter.fetchRelevantState();
  input.snapshots.push(
    createSnapshot(input.ctx, beforeState, "before", input.action.actionId),
  );
  const result = await executeRegisteredAction(
    input.ctx.adapter,
    input.action,
    input.ctx.clock,
  );
  const afterState = await input.ctx.adapter.fetchRelevantState();
  const after = createSnapshot(input.ctx, afterState, "after", input.action.actionId);
  input.snapshots.push(after);
  writeSnapshot(input.ctx, after);

  const entry: TimelineEntry = {
    sequence,
    runId: input.ctx.runId,
    simulatedAt: input.ctx.clock.nowIso(),
    realRecordedAt: new Date().toISOString(),
    actor: input.action.actor,
    actionType: input.action.type,
    actionId: input.action.actionId,
    intent: String(input.action.metadata.intent ?? input.action.type),
    requestSummary: result.requestSummary,
    responseSummary: result.responseSummary,
    agentDecisionSummary: null,
    domainActions: [input.action.type],
    stateChanges: result.ok ? ["adapter_ok"] : ["adapter_error"],
    validationResults: [],
    durationMs: Date.now() - started,
    status: result.ok ? "PASS" : "FAIL",
    errorCode: result.ok ? null : `http_${result.status}`,
    testGeneratedContent: true,
  };
  input.timeline.push(entry);
  const validations = runValidators(input.validators, "after_action", {
    run: input.ctx,
    timeline: input.timeline,
    snapshots: input.snapshots,
    lastEntry: entry,
  });
  entry.validationResults = validations;
  if (validations.some((row) => row.status === "FAIL" && row.severity === "fatal")) {
    entry.status = "FAIL";
  }
  logSimulation({
    level: entry.status === "FAIL" || entry.status === "ERROR" ? "failure" : "info",
    runId: input.ctx.runId,
    sequence: entry.sequence,
    simulatedAt: entry.simulatedAt,
    category: "action",
    message: `${entry.actionType} ${entry.status}`,
  });
  return entry;
}
