import { isRecord, requireInt, requireString, SchemaError } from "../utils/assert.ts";

export const PERSONA_SCHEMA_VERSION = 1 as const;

export type Persona = {
  schemaVersion: typeof PERSONA_SCHEMA_VERSION;
  id: string;
  version: string;
  identity: { displayName: string; locale: string; timezone: string };
  household: { role: string; size: number; notes?: string };
  home_context: Record<string, unknown>;
  family_structure: Record<string, unknown>;
  work_pattern: Record<string, unknown>;
  availability_pattern: Record<string, unknown>;
  calendar_usage: Record<string, unknown>;
  routines: Record<string, unknown>[];
  task_behavior: Record<string, unknown>;
  shopping_behavior: Record<string, unknown>;
  checklist_behavior: Record<string, unknown>;
  voice_vs_text: "voice" | "text" | "mixed";
  planning_style: Record<string, unknown>;
  notification_behavior: Record<string, unknown>;
  forgetfulness_pattern: Record<string, unknown>;
  interaction_style: Record<string, unknown>;
  stress_load_pattern: Record<string, unknown>;
  preferences: Record<string, unknown>;
  technology_behavior: Record<string, unknown>;
};

export function parsePersona(input: unknown): Persona {
  if (!isRecord(input)) throw new SchemaError("persona must be an object");
  if (input.schemaVersion !== PERSONA_SCHEMA_VERSION) {
    throw new SchemaError("unsupported persona schemaVersion");
  }
  const id = requireString(input, "id");
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(id)) throw new SchemaError("invalid persona id");
  if (!isRecord(input.identity) || !isRecord(input.household)) {
    throw new SchemaError("identity and household are required");
  }
  const voice = input.voice_vs_text ?? "mixed";
  if (voice !== "voice" && voice !== "text" && voice !== "mixed") {
    throw new SchemaError("invalid voice_vs_text");
  }
  return {
    schemaVersion: PERSONA_SCHEMA_VERSION,
    id,
    version: requireString(input, "version"),
    identity: {
      displayName: requireString(input.identity, "displayName"),
      locale: requireString(input.identity, "locale"),
      timezone: requireString(input.identity, "timezone"),
    },
    household: {
      role: requireString(input.household, "role"),
      size: requireInt(input.household, "size"),
      notes: typeof input.household.notes === "string" ? input.household.notes : undefined,
    },
    home_context: isRecord(input.home_context) ? input.home_context : {},
    family_structure: isRecord(input.family_structure) ? input.family_structure : {},
    work_pattern: isRecord(input.work_pattern) ? input.work_pattern : {},
    availability_pattern: isRecord(input.availability_pattern) ? input.availability_pattern : {},
    calendar_usage: isRecord(input.calendar_usage) ? input.calendar_usage : {},
    routines: Array.isArray(input.routines) ? input.routines.filter(isRecord) : [],
    task_behavior: isRecord(input.task_behavior) ? input.task_behavior : {},
    shopping_behavior: isRecord(input.shopping_behavior) ? input.shopping_behavior : {},
    checklist_behavior: isRecord(input.checklist_behavior) ? input.checklist_behavior : {},
    voice_vs_text: voice,
    planning_style: isRecord(input.planning_style) ? input.planning_style : {},
    notification_behavior: isRecord(input.notification_behavior) ? input.notification_behavior : {},
    forgetfulness_pattern: isRecord(input.forgetfulness_pattern) ? input.forgetfulness_pattern : {},
    interaction_style: isRecord(input.interaction_style) ? input.interaction_style : {},
    stress_load_pattern: isRecord(input.stress_load_pattern) ? input.stress_load_pattern : {},
    preferences: isRecord(input.preferences) ? input.preferences : {},
    technology_behavior: isRecord(input.technology_behavior) ? input.technology_behavior : {},
  };
}
