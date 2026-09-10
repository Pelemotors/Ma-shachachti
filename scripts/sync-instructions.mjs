import fs from "node:fs";

const md = fs
  .readFileSync("lib/agent/INSTRUCTIONS.he.md", "utf8")
  .replace(/\r\n/g, "\n");
const body = JSON.stringify(md.replace(/\n/g, "\r\n"));
fs.writeFileSync(
  "lib/agent/instructions.ts",
  `export const AGENT_CONTRACT_VERSION = "2026-09-11-schedule-semantics";

// Bundled on purpose. Do not read INSTRUCTIONS.he.md at runtime.
export const AGENT_INSTRUCTIONS = ${body};
`,
);
