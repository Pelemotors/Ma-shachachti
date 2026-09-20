import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RunSummary, Scorecard, TimelineEntry } from "../schemas/report.schema.ts";
import type { ValidationResult } from "../schemas/validation.schema.ts";

export function writeJsonSummary(resultDirectory: string, summary: RunSummary): string {
  const path = join(resultDirectory, "summary.json");
  writeFileSync(path, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  return path;
}

export function writeMarkdownSummary(input: {
  resultDirectory: string;
  summary: RunSummary;
  scorecard: Scorecard;
  timeline: TimelineEntry[];
  validations: ValidationResult[];
}): string {
  const fails = input.validations.filter((row) => row.status === "FAIL");
  const lines = [
    `# Simulation ${input.summary.runId}`,
    "",
    `- Persona: \`${input.summary.personaId}\` (${input.summary.personaVersion})`,
    `- Scenario: \`${input.summary.scenarioId}\` (${input.summary.scenarioVersion})`,
    `- Seed: ${input.summary.seed}`,
    `- Simulated period: ${input.summary.simulatedStart} → ${input.summary.simulatedEnd}`,
    `- Git SHA: \`${input.summary.gitSha}\``,
    `- Environment: ${input.summary.environment}`,
    "",
    "## Actions",
    "",
    `- Total: ${input.summary.actionCount}`,
    `- PASS: ${input.summary.passCount}`,
    `- FAIL: ${input.summary.failCount}`,
    `- Anomalies: ${input.summary.anomalyCount}`,
    "",
    "## Invariants / validators",
    "",
    ...fails.map((row) => `- FAIL ${row.validatorId}: ${row.message}`),
    fails.length ? "" : "- No validator failures.",
    "",
    "## Friction metrics",
    "",
    ...Object.entries(input.scorecard).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Timeline",
    "",
    ...input.timeline.map(
      (row) =>
        `- ${row.sequence}. ${row.simulatedAt} ${row.actionType} ${row.status}`,
    ),
    "",
  ];
  const path = join(input.resultDirectory, "summary.md");
  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
  return path;
}
