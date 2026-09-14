import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const AGENT_CONTRACT_VERSION = "2026-09-14-agent-runtime-v2";

const MODE_IDS = ["forgotten", "deep-check", "schedule", "free-time"];

function normalize(markdown) {
  return markdown.replace(/\r\n/g, "\n").trimEnd();
}

export function generateInstructionsSource({ core, modes }) {
  const modeEntries = MODE_IDS.map(
    (id) => `  ${JSON.stringify(id)}: ${JSON.stringify(modes[id])}`,
  ).join(",\n");
  return `export const AGENT_CONTRACT_VERSION = ${JSON.stringify(AGENT_CONTRACT_VERSION)};

/** Core constitution — loaded on every turn. */
export const AGENT_CORE_INSTRUCTIONS = ${JSON.stringify(core)};

/** Mode instructions — load only the active mode. */
export const AGENT_MODE_INSTRUCTIONS = {
${modeEntries}
} as const;

export type AgentModeId = keyof typeof AGENT_MODE_INSTRUCTIONS;

/** @deprecated Compatibility alias for tests/migrations; equals CORE only. */
export const AGENT_INSTRUCTIONS = AGENT_CORE_INSTRUCTIONS;

export function modeInstructionsFor(mode: string | null | undefined): string {
  if (!mode) return "";
  if (mode === "focus") return AGENT_MODE_INSTRUCTIONS.forgotten;
  return AGENT_MODE_INSTRUCTIONS[mode as AgentModeId] ?? "";
}
`;
}

export function bundleInstructions() {
  const core = normalize(readFileSync("lib/agent/instructions/core.md", "utf8"));
  const modes = {};
  for (const id of MODE_IDS) {
    modes[id] = normalize(
      readFileSync(join("lib/agent/instructions/modes", `${id}.md`), "utf8"),
    );
  }
  writeFileSync(
    "lib/agent/instructions.ts",
    generateInstructionsSource({ core, modes }),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  bundleInstructions();
}
