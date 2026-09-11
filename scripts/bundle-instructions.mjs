import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const AGENT_CONTRACT_VERSION = "2026-09-12-lean-foundation";

export function generateInstructionsSource(markdown) {
  const normalized = markdown.replace(/\r\n/g, "\n").trimEnd();
  return `export const AGENT_CONTRACT_VERSION = ${JSON.stringify(AGENT_CONTRACT_VERSION)};

// Bundled on purpose. Do not read INSTRUCTIONS.he.md at runtime.
export const AGENT_INSTRUCTIONS = ${JSON.stringify(normalized)};
`;
}

export function bundleInstructions() {
  const markdown = readFileSync("lib/agent/INSTRUCTIONS.he.md", "utf8");
  writeFileSync(
    "lib/agent/instructions.ts",
    generateInstructionsSource(markdown),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  bundleInstructions();
}
