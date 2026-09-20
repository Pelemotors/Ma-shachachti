import { isRecord, requireInt, requireString, SchemaError } from "../utils/assert.ts";

export const SNAPSHOT_SCHEMA_VERSION = 1 as const;

export type SimulationSnapshot = {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  snapshotId: string;
  runId: string;
  sequence: number;
  simulatedAt: string;
  phase: "before" | "after" | "checkpoint";
  relatedActionId?: string;
  tasks: Record<string, unknown>[];
  dayPlan: Record<string, unknown> | null;
  shopping: Record<string, unknown>[];
  checklists: Record<string, unknown>[];
  calendarConstraints: Record<string, unknown>[];
  household: Record<string, unknown> | null;
  jobs: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  agentVisible: Record<string, unknown>;
};

export function parseSnapshot(input: unknown): SimulationSnapshot {
  if (!isRecord(input)) throw new SchemaError("snapshot must be an object");
  if (input.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    throw new SchemaError("unsupported snapshot schemaVersion");
  }
  const phase = input.phase;
  if (phase !== "before" && phase !== "after" && phase !== "checkpoint") {
    throw new SchemaError("invalid snapshot phase");
  }
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    snapshotId: requireString(input, "snapshotId"),
    runId: requireString(input, "runId"),
    sequence: requireInt(input, "sequence"),
    simulatedAt: requireString(input, "simulatedAt"),
    phase,
    relatedActionId: typeof input.relatedActionId === "string" ? input.relatedActionId : undefined,
    tasks: Array.isArray(input.tasks) ? input.tasks.filter(isRecord) : [],
    dayPlan: isRecord(input.dayPlan) ? input.dayPlan : null,
    shopping: Array.isArray(input.shopping) ? input.shopping.filter(isRecord) : [],
    checklists: Array.isArray(input.checklists) ? input.checklists.filter(isRecord) : [],
    calendarConstraints: Array.isArray(input.calendarConstraints)
      ? input.calendarConstraints.filter(isRecord)
      : [],
    household: isRecord(input.household) ? input.household : null,
    jobs: Array.isArray(input.jobs) ? input.jobs.filter(isRecord) : [],
    notifications: Array.isArray(input.notifications) ? input.notifications.filter(isRecord) : [],
    agentVisible: isRecord(input.agentVisible) ? input.agentVisible : {},
  };
}
