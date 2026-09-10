import { readFileSync, writeFileSync } from "node:fs";

const md = readFileSync("lib/agent/INSTRUCTIONS.he.md", "utf8")
  .replace(/\r\n/g, "\n")
  .trimEnd();

const src = `export const AGENT_CONTRACT_VERSION = "2026-09-10-lean-task-list";

// Bundled on purpose. Do not read INSTRUCTIONS.he.md at runtime.
export const AGENT_INSTRUCTIONS = ${JSON.stringify(md)};
`;

writeFileSync("lib/agent/instructions.ts", src);
