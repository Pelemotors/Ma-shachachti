import { isRecord, requireString, SchemaError } from "../utils/assert.ts";

export const scenarioEventTypes = [
  "user_action",
  "external_event",
  "calendar_event",
  "notification_delivery",
  "app_lifecycle",
  "network_change",
  "time_advance",
  "household_action",
] as const;

export type ScenarioEventType = (typeof scenarioEventTypes)[number];

export type ScenarioEvent = {
  id: string;
  at: string;
  type: ScenarioEventType;
  actionType?: string;
  payload: Record<string, unknown>;
};

export function parseScenarioEvent(input: unknown): ScenarioEvent {
  if (!isRecord(input)) throw new SchemaError("event must be an object");
  const type = requireString(input, "type");
  if (!(scenarioEventTypes as readonly string[]).includes(type)) {
    throw new SchemaError(`unknown event type ${type}`);
  }
  return {
    id: requireString(input, "id"),
    at: requireString(input, "at"),
    type: type as ScenarioEventType,
    actionType: typeof input.actionType === "string" ? input.actionType : undefined,
    payload: isRecord(input.payload) ? input.payload : {},
  };
}
