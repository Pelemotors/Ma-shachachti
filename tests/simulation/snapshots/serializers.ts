import { redactValue } from "../utils/redact.ts";
import type { SimulationSnapshot } from "../schemas/snapshot.schema.ts";

export function serializeSnapshot(snapshot: SimulationSnapshot): string {
  return `${JSON.stringify(redactValue(snapshot), Object.keys(snapshot).sort())}\n`;
}

export function normalizeForReplay(value: unknown): unknown {
  return JSON.parse(JSON.stringify(redactValue(value)));
}
