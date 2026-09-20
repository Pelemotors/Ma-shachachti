import { isRecord, requireString, SchemaError } from "../utils/assert.ts";
import { parseScenarioEvent, type ScenarioEvent } from "./event.schema.ts";

export const SCENARIO_SCHEMA_VERSION = 1 as const;

export type Scenario = {
  schemaVersion: typeof SCENARIO_SCHEMA_VERSION;
  id: string;
  version: string;
  title: string;
  description: string;
  start: string;
  timezone: string;
  duration: { days: number };
  events: ScenarioEvent[];
  preconditions: string[];
  expectedHardInvariants: string[];
  expectedOutcomes: string[];
  tags: string[];
};

export function parseScenario(input: unknown): Scenario {
  if (!isRecord(input)) throw new SchemaError("scenario must be an object");
  if (input.schemaVersion !== SCENARIO_SCHEMA_VERSION) {
    throw new SchemaError("unsupported scenario schemaVersion");
  }
  const id = requireString(input, "id");
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(id)) throw new SchemaError("invalid scenario id");
  const duration = isRecord(input.duration) ? input.duration : { days: 1 };
  const days = typeof duration.days === "number" ? duration.days : 1;
  if (!Array.isArray(input.events)) throw new SchemaError("events must be an array");
  return {
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    id,
    version: requireString(input, "version"),
    title: requireString(input, "title"),
    description: requireString(input, "description"),
    start: requireString(input, "start"),
    timezone: requireString(input, "timezone"),
    duration: { days },
    events: input.events.map(parseScenarioEvent),
    preconditions: Array.isArray(input.preconditions)
      ? input.preconditions.filter((row) => typeof row === "string")
      : [],
    expectedHardInvariants: Array.isArray(input.expectedHardInvariants)
      ? input.expectedHardInvariants.filter((row) => typeof row === "string")
      : [],
    expectedOutcomes: Array.isArray(input.expectedOutcomes)
      ? input.expectedOutcomes.filter((row) => typeof row === "string")
      : [],
    tags: Array.isArray(input.tags) ? input.tags.filter((row) => typeof row === "string") : [],
  };
}
