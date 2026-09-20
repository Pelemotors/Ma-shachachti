import { appendFileSync, writeFileSync } from "node:fs";

export function writeJsonl(path: string, rows: unknown[]): void {
  const body = rows.map((row) => JSON.stringify(row)).join("\n");
  writeFileSync(path, body ? `${body}\n` : "", "utf8");
}

export function appendJsonl(path: string, row: unknown): void {
  appendFileSync(path, `${JSON.stringify(row)}\n`, "utf8");
}
