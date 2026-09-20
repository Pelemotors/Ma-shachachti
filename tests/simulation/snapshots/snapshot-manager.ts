import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ProductState } from "../adapters/product-adapter.ts";
import type { RunContext } from "../runner/run-context.ts";
import {
  SNAPSHOT_SCHEMA_VERSION,
  type SimulationSnapshot,
} from "../schemas/snapshot.schema.ts";
import { redactValue } from "../utils/redact.ts";

export function createSnapshot(
  ctx: RunContext,
  state: ProductState,
  phase: SimulationSnapshot["phase"],
  relatedActionId?: string,
): SimulationSnapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    snapshotId: `${ctx.runId}_s${String(ctx.sequence).padStart(4, "0")}_${phase}`,
    runId: ctx.runId,
    sequence: ctx.sequence,
    simulatedAt: ctx.clock.nowIso(),
    phase,
    relatedActionId,
    tasks: state.tasks,
    dayPlan: state.dayPlan,
    shopping: state.shopping,
    checklists: state.checklists,
    calendarConstraints: state.calendarConstraints,
    household: state.household,
    jobs: state.jobs,
    notifications: state.notifications,
    agentVisible: state.agentVisible,
  };
}

export function writeSnapshot(ctx: RunContext, snapshot: SimulationSnapshot): string {
  const path = join(ctx.resultDirectory, "snapshots", `${snapshot.snapshotId}.json`);
  writeFileSync(path, `${JSON.stringify(redactValue(snapshot), null, 2)}\n`, "utf8");
  return path;
}
