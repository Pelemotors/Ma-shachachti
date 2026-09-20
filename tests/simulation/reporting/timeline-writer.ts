import { join } from "node:path";
import type { TimelineEntry } from "../schemas/report.schema.ts";
import { writeJsonl } from "../utils/jsonl.ts";
import { redactValue } from "../utils/redact.ts";

export function writeTimeline(resultDirectory: string, entries: TimelineEntry[]): string {
  const path = join(resultDirectory, "timeline.jsonl");
  writeJsonl(path, entries.map((entry) => redactValue(entry)));
  return path;
}
