import {
  isProductionTarget,
  type SimulationEnvironment,
} from "./environments.ts";

export class ProductionGuardError extends Error {
  constructor(message = "Simulation refused: PRODUCTION TARGET is forbidden.") {
    super(message);
    this.name = "ProductionGuardError";
  }
}

export function assertSafeEnvironment(env: SimulationEnvironment): void {
  if (isProductionTarget(env)) {
    throw new ProductionGuardError();
  }
}

const SECRET_KEY_RE =
  /(password|secret|token|authorization|api[_-]?key|service_role|private[_-]?key|cookie)/i;

export function collectPublicSecretLeaks(
  publicFields: Record<string, unknown>,
): string[] {
  const leaks: string[] = [];
  for (const [key, value] of Object.entries(publicFields)) {
    if (!SECRET_KEY_RE.test(key)) continue;
    if (value == null || value === "") continue;
    leaks.push(key);
  }
  return leaks;
}
