#!/usr/bin/env node
/**
 * QA Next.js build — isolated dist (.next-qa), never touches production .next.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const ENV_FILE = resolve(ROOT, ".env.qa");

if (!existsSync(ENV_FILE)) {
  console.error("חסר .env.qa");
  process.exit(1);
}

for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
  const i = trimmed.indexOf("=");
  const key = trimmed.slice(0, i).trim();
  let value = trimmed.slice(i + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  process.env[key] = value;
}

process.env.APP_ENV = "qa";
process.env.NEXT_DIST_DIR = ".next-qa";
delete process.env.MA_SHACHACHTI_PRODUCTION_BUILD;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
if (!url.includes("8011")) {
  console.error(
    `QA guard: NEXT_PUBLIC_SUPABASE_URL חייב להצביע על :8011 (קיבל: ${url})`,
  );
  process.exit(1);
}

console.log(`[build:qa] env=${ENV_FILE}`);
console.log(`[build:qa] NEXT_PUBLIC_SUPABASE_URL=${url}`);
console.log("[build:qa] NEXT_DIST_DIR=.next-qa APP_ENV=qa");

const result = spawnSync("npx", ["next", "build", "--webpack"], {
  stdio: "inherit",
  env: process.env,
  shell: false,
});
process.exit(result.status ?? 1);
