import { PERSONA_SCHEMA_VERSION, type Persona } from "../schemas/persona.schema.ts";
import { SCENARIO_SCHEMA_VERSION, type Scenario } from "../schemas/scenario.schema.ts";

export function samplePersona(id = "harness-probe"): Persona {
  return {
    schemaVersion: PERSONA_SCHEMA_VERSION,
    id,
    version: "0.0.0-engine",
    identity: { displayName: "Probe", locale: "he-IL", timezone: "Asia/Jerusalem" },
    household: { role: "engine", size: 0 },
    voice_vs_text: "text",
    home_context: {},
    family_structure: {},
    work_pattern: {},
    availability_pattern: {},
    calendar_usage: {},
    routines: [],
    task_behavior: {},
    shopping_behavior: {},
    checklist_behavior: {},
    planning_style: {},
    notification_behavior: {},
    forgetfulness_pattern: {},
    interaction_style: {},
    stress_load_pattern: {},
    preferences: {},
    technology_behavior: {},
  };
}

export function sampleScenario(): Scenario {
  return {
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    id: "engine-smoke",
    version: "0.0.0-engine",
    title: "Engine smoke",
    description: "Synthetic engine commands only.",
    start: "2026-09-21T05:00:00.000Z",
    timezone: "Asia/Jerusalem",
    duration: { days: 1 },
    events: [
      {
        id: "e1",
        at: "2026-09-21T05:00:00.000Z",
        type: "user_action",
        actionType: "engine.ping",
        payload: {},
      },
      {
        id: "e2",
        at: "2026-09-21T06:00:00.000Z",
        type: "time_advance",
        actionType: "time.advance",
        payload: { minutes: 30 },
      },
    ],
    preconditions: [],
    expectedHardInvariants: [],
    expectedOutcomes: [],
    tags: ["engine"],
  };
}
