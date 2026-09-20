import { execSync } from "node:child_process";
import { createInMemoryHarnessAdapter } from "../adapters/in-memory-harness-adapter.ts";
import { loadSimulationConfig } from "../config/simulation.config.ts";
import { PERSONA_SCHEMA_VERSION, type Persona } from "../schemas/persona.schema.ts";
import { SCENARIO_SCHEMA_VERSION, type Scenario } from "../schemas/scenario.schema.ts";
import { runSimulation } from "../runner/simulation-runner.ts";
import { normalizeRunOutput } from "../reporting/report-writer.ts";

const harnessPersona: Persona = {
  schemaVersion: PERSONA_SCHEMA_VERSION,
  id: "harness-probe",
  version: "0.0.0-engine",
  identity: {
    displayName: "Harness Probe",
    locale: "he-IL",
    timezone: "Asia/Jerusalem",
  },
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

const harnessScenario: Scenario = {
  schemaVersion: SCENARIO_SCHEMA_VERSION,
  id: "engine-smoke",
  version: "0.0.0-engine",
  title: "Engine smoke",
  description: "Synthetic engine commands only. Not a product scenario.",
  start: "2026-09-21T05:00:00.000Z",
  timezone: "Asia/Jerusalem",
  duration: { days: 1 },
  events: [
    {
      id: "e1",
      at: "2026-09-21T05:00:00.000Z",
      type: "user_action",
      actionType: "engine.ping",
      payload: { note: "start" },
    },
    {
      id: "e2",
      at: "2026-09-21T06:00:00.000Z",
      type: "time_advance",
      actionType: "time.advance",
      payload: { minutes: 60 },
    },
    {
      id: "e3",
      at: "2026-09-21T07:00:00.000Z",
      type: "user_action",
      actionType: "task.create",
      payload: { title: "engine-smoke-task" },
    },
  ],
  preconditions: [],
  expectedHardInvariants: [],
  expectedOutcomes: [],
  tags: ["engine", "smoke"],
};

function gitSha(): string {
  return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
}

export async function runSmoke() {
  const config = loadSimulationConfig({ seed: 1001, env: "test" });
  const realRunTime = "2026-09-20T00:00:00.000Z";
  const first = await runSimulation({
    config,
    gitSha: gitSha(),
    persona: harnessPersona,
    scenario: harnessScenario,
    adapter: createInMemoryHarnessAdapter(),
    realRunTime,
  });
  const second = await runSimulation({
    config,
    gitSha: gitSha(),
    persona: harnessPersona,
    scenario: harnessScenario,
    adapter: createInMemoryHarnessAdapter(),
    realRunTime,
  });
  const hashA = normalizeRunOutput(first);
  const hashB = normalizeRunOutput(second);
  if (hashA !== hashB) {
    throw new Error("Deterministic replay mismatch.");
  }
  if (first.validations.some((row) => row.status === "FAIL")) {
    throw new Error("Smoke validators failed.");
  }
  return { first, second, hash: hashA };
}

if (process.argv[1]?.endsWith("smoke.ts")) {
  const result = await runSmoke();
  console.log("SMOKE PASS");
  console.log(`runId=${result.first.ctx.runId}`);
  console.log(`dir=${result.first.ctx.resultDirectory}`);
  console.log(`replayHash=${result.hash}`);
}
