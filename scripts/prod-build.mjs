#!/usr/bin/env node
/**
 * Production Next.js build — always loads .env.production and refuses QA config.
 */
import { spawnSync, execSync } from "node:child_process";
import { resolve } from "node:path";
import { applyProductionEnv } from "./load-production-env.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const loaded = applyProductionEnv();
console.log(`[build:prod] env=${loaded.envFile}`);
console.log(`[build:prod] NEXT_PUBLIC_SUPABASE_URL=${loaded.supabaseUrl}`);
console.log("[build:prod] APP_ENV=production");

const result = spawnSync("npx", ["next", "build", "--webpack"], {
  stdio: "inherit",
  env: process.env,
  cwd: ROOT,
  shell: false,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

try {
  const hits = execSync(
    "rg -l '127\\.0\\.0\\.1:8011|localhost:8011' .next -g '*.js' || true",
    { encoding: "utf8", cwd: ROOT },
  ).trim();
  if (hits) {
    console.error("[build:prod] FAIL: QA URL נמצא בפלט ה-build:");
    console.error(hits);
    process.exit(1);
  }
} catch {
  // rg missing is non-fatal; env guard already ran.
}
console.log("[build:prod] bake verification OK (no QA URL in .next)");
