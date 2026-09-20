export const SIMULATION_ENVIRONMENTS = [
  "local",
  "test",
  "staging",
  "production",
] as const;

export type SimulationEnvironment = (typeof SIMULATION_ENVIRONMENTS)[number];

export function parseEnvironment(value: string | undefined): SimulationEnvironment {
  const raw = (value ?? "local").trim().toLowerCase();
  if ((SIMULATION_ENVIRONMENTS as readonly string[]).includes(raw)) {
    return raw as SimulationEnvironment;
  }
  throw new Error(`Unknown SIMULATION_ENV: ${value}`);
}

export function isProductionTarget(env: SimulationEnvironment): boolean {
  return env === "production";
}
