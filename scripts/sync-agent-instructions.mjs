import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mdPath = join(root, "lib/agent/INSTRUCTIONS.he.md");
const outPath = join(root, "lib/agent/instructions.ts");
const md = readFileSync(mdPath, "utf8");
const escaped = md
  .replace(/\\/g, "\\\\")
  .replace(/`/g, "\\`")
  .replace(/\$\{/g, "\\${");
const out = `/** Auto-synced from INSTRUCTIONS.he.md — run: node scripts/sync-agent-instructions.mjs */
export const AGENT_CONTRACT_VERSION = "2026-09-08-open-working-memory";
export const AGENT_INSTRUCTIONS = \`
${escaped}
\`;
`;
writeFileSync(outPath, out);
console.log(`Synced ${md.length} chars → lib/agent/instructions.ts`);
