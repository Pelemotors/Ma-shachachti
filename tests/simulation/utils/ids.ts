import { createHash } from "node:crypto";

export function shaShort(value: string, length = 12): string {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

export function buildRunId(input: {
  seed: number;
  gitSha: string;
  personaId: string;
  scenarioId: string;
  startedAtReal: string;
}): string {
  const digest = shaShort(
    `${input.gitSha}:${input.personaId}:${input.scenarioId}:${input.seed}:${input.startedAtReal}`,
    16,
  );
  return `sim_${digest}`;
}

export function buildActionId(runId: string, sequence: number): string {
  return `${runId}_a${String(sequence).padStart(4, "0")}`;
}

export function buildCorrelationId(runId: string, sequence: number): string {
  return `${runId}:seq:${sequence}`;
}
