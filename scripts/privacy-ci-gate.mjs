#!/usr/bin/env node
/**
 * Privacy CI gate — fails the build if critical privacy invariants are missing.
 * Run via: node scripts/privacy-ci-gate.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function mustExist(rel) {
  const path = resolve(root, rel);
  if (!existsSync(path)) {
    console.error(`PRIVACY_GATE_FAIL missing ${rel}`);
    process.exit(1);
  }
}

function mustMatch(rel, re, label) {
  const text = readFileSync(resolve(root, rel), "utf8");
  if (!re.test(text)) {
    console.error(`PRIVACY_GATE_FAIL ${label} in ${rel}`);
    process.exit(1);
  }
}

mustExist("app/privacy/page.tsx");
mustExist("app/account-deletion/page.tsx");
mustExist("lib/account/delete-account.ts");
mustExist("docs/google-play-data-safety-audit.md");
mustMatch(
  "app/api/account/delete/route.ts",
  /deleteUserAccountFully/,
  "account delete uses full purge",
);
mustMatch(
  "lib/reminder-dispatch.ts",
  /יש לך תזכורת ממתינה/,
  "generic push lock body",
);
mustMatch(
  "hooks/use-audio-recorder.ts",
  /ensureMicDisclosureAccepted/,
  "mic disclosure before record",
);

const test = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "--test", "tests/privacy-compliance.test.ts"],
  { cwd: root, stdio: "inherit" },
);
if (test.status !== 0) {
  console.error("PRIVACY_GATE_FAIL privacy-compliance tests");
  process.exit(test.status ?? 1);
}

console.log("PRIVACY_GATE_OK");
