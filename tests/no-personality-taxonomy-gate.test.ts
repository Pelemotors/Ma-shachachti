/**
 * Static gate: old personality taxonomy must not re-enter the Production Agent path.
 * Fails CI if forbidden symbols appear in runtime/agent/chat code.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

const FORBIDDEN = [
  "AGENT_POLICY_TRAITS",
  "DEFAULT_AGENT_POLICY",
  "resolvePersonalAgentPolicy",
  "applyAgentPolicySignals",
  "PERSONAL_AGENT_POLICY_INSTRUCTIONS",
  "policySignals",
];

const SCAN_ROOTS = [
  join(ROOT, "lib", "agent"),
  join(ROOT, "lib", "domain"),
  join(ROOT, "lib", "server"),
  join(ROOT, "app", "api", "chat"),
];

function walkTs(dir: string, out: string[]) {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkTs(full, out);
    else if (name.endsWith(".ts") || name.endsWith(".tsx")) out.push(full);
  }
}

test("OLD_PERSONALITY_TAXONOMY gate: Production Agent path has no trait-policy symbols", () => {
  const files: string[] = [];
  for (const root of SCAN_ROOTS) walkTs(root, files);
  const hits: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const token of FORBIDDEN) {
      if (text.includes(token)) hits.push(`${file}: ${token}`);
    }
  }
  assert.deepEqual(hits, []);
});
