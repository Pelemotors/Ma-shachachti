import { parseEnvironment, type SimulationEnvironment } from "./environments.ts";
import { assertSafeEnvironment } from "./safety.ts";

export type SimulationConfig = {
  env: SimulationEnvironment;
  apiBaseUrl: string;
  seed: number;
  timeZone: string;
  resultsDir: string;
  startIso: string;
};

export function loadSimulationConfig(
  overrides: Partial<SimulationConfig> = {},
): SimulationConfig {
  const env = parseEnvironment(overrides.env ?? process.env.SIMULATION_ENV);
  assertSafeEnvironment(env);
  const seedRaw = overrides.seed ?? Number(process.env.SIMULATION_SEED ?? 1001);
  if (!Number.isInteger(seedRaw)) {
    throw new Error("SIMULATION_SEED must be an integer.");
  }
  return {
    env,
    apiBaseUrl: (
      overrides.apiBaseUrl ??
      process.env.SIMULATION_API_BASE_URL ??
      ""
    ).trim(),
    seed: seedRaw,
    timeZone:
      overrides.timeZone ??
      process.env.SIMULATION_TIMEZONE ??
      "Asia/Jerusalem",
    resultsDir:
      overrides.resultsDir ??
      process.env.SIMULATION_RESULTS_DIR ??
      "test-results/simulation",
    startIso: overrides.startIso ?? "2026-09-21T05:00:00.000Z",
  };
}
