import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function escapeTemplate(md) {
  return md
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

const constitutionMd = readFileSync(
  join(root, "lib/agent/INSTRUCTIONS.he.md"),
  "utf8",
);
const contractMd = readFileSync(
  join(root, "lib/agent/RUNTIME_CAPABILITY_CONTRACT.he.md"),
  "utf8",
);

const constitutionOut = `/** Auto-synced from INSTRUCTIONS.he.md — run: node scripts/sync-agent-instructions.mjs */
export const AGENT_CONTRACT_VERSION = "2026-09-09-global-constitution-v1";
export const GLOBAL_AGENT_CONSTITUTION = \`
${escapeTemplate(constitutionMd)}
\`;
/** @deprecated Alias — use GLOBAL_AGENT_CONSTITUTION. Kept for bundle tracing. */
export const AGENT_INSTRUCTIONS = GLOBAL_AGENT_CONSTITUTION;
`;

const contractOut = `/** Auto-synced from RUNTIME_CAPABILITY_CONTRACT.he.md — run: node scripts/sync-agent-instructions.mjs */
export const RUNTIME_CAPABILITY_CONTRACT = \`
${escapeTemplate(contractMd)}
\`;
`;

writeFileSync(join(root, "lib/agent/instructions.ts"), constitutionOut);
writeFileSync(join(root, "lib/agent/runtime-contract.ts"), contractOut);
console.log(
  `Synced constitution ${constitutionMd.length} chars + contract ${contractMd.length} chars`,
);
