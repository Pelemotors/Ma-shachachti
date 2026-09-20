import { containsRawSecret } from "../../utils/redact.ts";
import { parseSnapshot } from "../../schemas/snapshot.schema.ts";
import { result, type SimulationValidator } from "../index.ts";

export const engineValidators: SimulationValidator[] = [
  {
    id: "engine.clock_monotonic",
    category: "engine",
    severity: "fatal",
    when: "after_action",
    validate(ctx) {
      return result(
        this,
        ctx.run.clock.isMonotonic() ? "PASS" : "FAIL",
        ctx.run.clock.isMonotonic()
          ? "Simulated clock is monotonic."
          : "Simulated clock moved backwards.",
      );
    },
  },
  {
    id: "engine.action_ids_unique",
    category: "engine",
    severity: "fatal",
    when: "after_action",
    validate(ctx) {
      const ids = ctx.timeline.map((row) => row.actionId);
      const unique = new Set(ids);
      return result(
        this,
        unique.size === ids.length ? "PASS" : "FAIL",
        unique.size === ids.length
          ? "Action IDs are unique."
          : "Duplicate action IDs detected.",
        { evidence: { count: ids.length, unique: unique.size } },
      );
    },
  },
  {
    id: "engine.sequence_monotonic",
    category: "engine",
    severity: "fatal",
    when: "after_action",
    validate(ctx) {
      const ok = ctx.timeline.every((row, index) => row.sequence === index + 1);
      return result(
        this,
        ok ? "PASS" : "FAIL",
        ok ? "Event sequence is monotonic." : "Event sequence is not monotonic.",
      );
    },
  },
  {
    id: "engine.run_id_consistent",
    category: "engine",
    severity: "fatal",
    when: "after_action",
    validate(ctx) {
      const ok = ctx.timeline.every((row) => row.runId === ctx.run.runId);
      return result(
        this,
        ok ? "PASS" : "FAIL",
        ok ? "Run ID is consistent." : "Timeline contains a foreign run ID.",
      );
    },
  },
  {
    id: "engine.no_raw_secrets",
    category: "privacy",
    severity: "fatal",
    when: "after_action",
    validate(ctx) {
      const leak = ctx.timeline.some(containsRawSecret);
      return result(
        this,
        leak ? "FAIL" : "PASS",
        leak ? "Raw secrets found in timeline." : "No raw secrets in timeline.",
      );
    },
  },
  {
    id: "engine.action_has_outcome",
    category: "engine",
    severity: "error",
    when: "after_action",
    validate(ctx) {
      const last = ctx.lastEntry;
      const ok = Boolean(last && last.status);
      return result(
        this,
        ok ? "PASS" : "FAIL",
        ok ? "Action has an outcome." : "Action is missing an outcome.",
        { relatedActionIds: last ? [last.actionId] : [] },
      );
    },
  },
  {
    id: "engine.fail_not_silent_pass",
    category: "engine",
    severity: "fatal",
    when: "end_of_run",
    validate(ctx) {
      const silent = ctx.timeline.some(
        (row) =>
          row.status === "PASS" &&
          row.validationResults.some(
            (item) => item.status === "FAIL" && item.severity === "fatal",
          ),
      );
      return result(
        this,
        silent ? "FAIL" : "PASS",
        silent
          ? "FAIL action was recorded as PASS."
          : "Failure status is not silently flipped.",
      );
    },
  },
  {
    id: "engine.snapshot_schema",
    category: "engine",
    severity: "error",
    when: "after_action",
    validate(ctx) {
      try {
        for (const snapshot of ctx.snapshots) parseSnapshot(snapshot);
        return result(this, "PASS", "Snapshot schema is valid.");
      } catch (error) {
        return result(this, "FAIL", "Snapshot schema is invalid.", {
          evidence: { error: error instanceof Error ? error.message : "invalid" },
        });
      }
    },
  },
  {
    id: "engine.report_action_refs",
    category: "engine",
    severity: "error",
    when: "end_of_run",
    validate(ctx) {
      const ids = new Set(ctx.timeline.map((row) => row.actionId));
      const dangling = ctx.timeline.flatMap((row) =>
        row.validationResults.flatMap((item) =>
          item.relatedActionIds.filter((id) => !ids.has(id)),
        ),
      );
      return result(
        this,
        dangling.length === 0 ? "PASS" : "FAIL",
        dangling.length === 0
          ? "Report action references are valid."
          : "Report references unknown action IDs.",
        { evidence: { dangling } },
      );
    },
  },
];

export const invariantsDirReadme =
  "Engine invariants live here. Product-specific invariants arrive with personas.";
