#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");

function mustExist(rel) {
  if (!existsSync(resolve(root, rel))) {
    console.error(`CODE_DEPLOY_GATE_FAIL missing ${rel}`);
    process.exit(1);
  }
}

function mustMatch(rel, re, label) {
  if (!re.test(readFileSync(resolve(root, rel), "utf8"))) {
    console.error(`CODE_DEPLOY_GATE_FAIL ${label}`);
    process.exit(1);
  }
}

mustExist("app/privacy/page.tsx");
mustExist("app/account-deletion/page.tsx");
mustExist("database/migrations/20260920_play_release_domain.sql");
mustExist("docs/google-play-release-data-contract.md");
mustMatch("lib/actions.ts", /updateDayPlan/, "day_plan SoT in saveTaskPlans");
mustMatch("lib/crypto/token-envelope.ts", /aes-256-gcm/, "calendar token encryption");
mustMatch("apps/mobile/app.config.ts", /AD_ID|READ_CONTACTS|ACCESS_FINE_LOCATION/, "blocked sensitive perms");

const test = spawnSync(
  process.execPath,
  [
    "--experimental-strip-types",
    "--test",
    "tests/play-release-domain.test.ts",
    "tests/privacy-compliance.test.ts",
  ],
  { cwd: root, stdio: "inherit" },
);
if (test.status !== 0) process.exit(test.status ?? 1);
console.log("CODE_DEPLOY_GATE_PASS");
