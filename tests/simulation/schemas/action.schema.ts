import { isRecord, requireString, SchemaError } from "../utils/assert.ts";

export type ActionTransport = "http" | "in_memory" | "clock";

export type SimulationAction = {
  actionId: string;
  type: string;
  simulatedAt: string;
  actor: string;
  input: Record<string, unknown>;
  expectedTransport: ActionTransport;
  metadata: Record<string, unknown>;
};

export function parseSimulationAction(input: unknown): SimulationAction {
  if (!isRecord(input)) throw new SchemaError("action must be an object");
  const transport = input.expectedTransport ?? "in_memory";
  if (transport !== "http" && transport !== "in_memory" && transport !== "clock") {
    throw new SchemaError("invalid expectedTransport");
  }
  return {
    actionId: requireString(input, "actionId"),
    type: requireString(input, "type"),
    simulatedAt: requireString(input, "simulatedAt"),
    actor: requireString(input, "actor"),
    input: isRecord(input.input) ? input.input : {},
    expectedTransport: transport,
    metadata: isRecord(input.metadata) ? input.metadata : {},
  };
}
