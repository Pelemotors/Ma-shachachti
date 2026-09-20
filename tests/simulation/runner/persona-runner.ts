import type { Persona } from "../schemas/persona.schema.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RunContext } from "./run-context.ts";

export function recordPersonaUse(ctx: RunContext, persona: Persona): void {
  writeFileSync(
    join(ctx.resultDirectory, "personas", `${persona.id}.json`),
    `${JSON.stringify({ id: persona.id, version: persona.version, schemaVersion: persona.schemaVersion }, null, 2)}\n`,
    "utf8",
  );
}
