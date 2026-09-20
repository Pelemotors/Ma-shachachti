export const RUN_PHASES = [
  "INIT",
  "ENV_SAFETY_CHECK",
  "LOAD_CONFIG",
  "LOAD_PERSONA",
  "LOAD_SCENARIO",
  "VALIDATE_INPUT",
  "SETUP",
  "AUTH",
  "RUN_EVENTS",
  "END_OF_DAY_EVALUATION",
  "END_OF_RUN_EVALUATION",
  "REPORT",
  "TEARDOWN",
] as const;

export type RunPhase = (typeof RUN_PHASES)[number];

export type FailurePolicy = "continue" | "stop_scenario" | "fatal";

export function resolveFailurePolicy(severity: string): FailurePolicy {
  if (severity === "fatal") return "fatal";
  if (severity === "error") return "stop_scenario";
  return "continue";
}
