import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { redactValue } from "../utils/redact.ts";

export type Anomaly = {
  id: string;
  kind: string;
  message: string;
  simulatedAt: string;
  relatedActionIds: string[];
};

export function writeAnomalies(resultDirectory: string, anomalies: Anomaly[]): void {
  for (const anomaly of anomalies) {
    writeFileSync(
      join(resultDirectory, "anomalies", `${anomaly.id}.json`),
      `${JSON.stringify(redactValue(anomaly), null, 2)}\n`,
      "utf8",
    );
  }
}
