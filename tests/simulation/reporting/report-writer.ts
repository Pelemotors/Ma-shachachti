import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RunContext } from "../runner/run-context.ts";
import type { RunSummary, Scorecard, TimelineEntry } from "../schemas/report.schema.ts";
import type { ValidationResult } from "../schemas/validation.schema.ts";
import { redactValue } from "../utils/redact.ts";
import { writeAnomalies, type Anomaly } from "./anomaly-writer.ts";
import { writeJsonSummary, writeMarkdownSummary } from "./summary-writer.ts";
import { writeTimeline } from "./timeline-writer.ts";

export function normalizeRunOutput(input: {
  timeline: TimelineEntry[];
  validations: ValidationResult[];
  scorecard: Scorecard;
}): string {
  const payload = redactValue({
    timeline: input.timeline.map(({ realRecordedAt: _real, durationMs: _ms, ...rest }) => rest),
    validations: input.validations,
    scorecard: input.scorecard,
  });
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function writeFailure(resultDirectory: string, failure: Record<string, unknown>): void {
  const id = String(failure.id ?? `fail_${Date.now()}`);
  writeFileSync(
    join(resultDirectory, "failures", `${id}.json`),
    `${JSON.stringify(redactValue(failure), null, 2)}\n`,
    "utf8",
  );
}

export function writeRunArtifacts(input: {
  ctx: RunContext;
  timeline: TimelineEntry[];
  validations: ValidationResult[];
  scorecard: Scorecard;
  anomalies?: Anomaly[];
}): RunSummary {
  const summary: RunSummary = {
    runId: input.ctx.runId,
    seed: input.ctx.seed,
    gitSha: input.ctx.gitSha,
    environment: input.ctx.environment,
    personaId: input.ctx.personaId,
    scenarioId: input.ctx.scenarioId,
    personaVersion: input.ctx.personaVersion,
    scenarioVersion: input.ctx.scenarioVersion,
    schemaVersion: 1,
    simulatedStart: input.timeline[0]?.simulatedAt ?? input.ctx.clock.nowIso(),
    simulatedEnd: input.ctx.clock.nowIso(),
    realRunTime: input.ctx.realRunTime,
    actionCount: input.timeline.length,
    passCount: input.timeline.filter((row) => row.status === "PASS").length,
    failCount: input.timeline.filter((row) => row.status === "FAIL" || row.status === "ERROR")
      .length,
    anomalyCount: input.anomalies?.length ?? 0,
    normalizedHash: normalizeRunOutput(input),
  };
  writeTimeline(input.ctx.resultDirectory, input.timeline);
  writeJsonSummary(input.ctx.resultDirectory, summary);
  writeMarkdownSummary({
    resultDirectory: input.ctx.resultDirectory,
    summary,
    scorecard: input.scorecard,
    timeline: input.timeline,
    validations: input.validations,
  });
  writeFileSync(
    join(input.ctx.resultDirectory, "scorecard.json"),
    `${JSON.stringify(input.scorecard, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    join(input.ctx.resultDirectory, "run.json"),
    `${JSON.stringify(
      {
        runId: input.ctx.runId,
        seed: input.ctx.seed,
        gitSha: input.ctx.gitSha,
        environment: input.ctx.environment,
        personaId: input.ctx.personaId,
        scenarioId: input.ctx.scenarioId,
        personaVersion: input.ctx.personaVersion,
        scenarioVersion: input.ctx.scenarioVersion,
        schemaVersion: 1,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  writeAnomalies(input.ctx.resultDirectory, input.anomalies ?? []);
  for (const row of input.validations.filter((item) => item.status === "FAIL")) {
    writeFailure(input.ctx.resultDirectory, {
      id: `${row.validatorId}_${row.relatedActionIds[0] ?? "run"}`,
      validator: row.validatorId,
      severity: row.severity,
      message: row.message,
      evidence: row.evidence,
      relatedActionIds: row.relatedActionIds,
    });
  }
  return summary;
}
