#!/usr/bin/env node
/**
 * Load and validate Production env for build/deploy.
 * Refuses QA Supabase URL or APP_ENV=qa so Production never bakes QA config.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const ENV_FILE = resolve(ROOT, ".env.production");

const QA_URL_MARKERS = [
  "127.0.0.1:8011",
  "localhost:8011",
  "mashachachti-qa",
];

export function parseEnvFile(path) {
  if (!existsSync(path)) {
    throw new Error(`חסר קובץ env: ${path}`);
  }
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
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
    out[key] = value;
  }
  return out;
}

export function assertProductionSafe(env, { source = "env" } = {}) {
  const appEnv = String(env.APP_ENV ?? "")
    .trim()
    .toLowerCase();
  if (appEnv === "qa") {
    throw new Error(
      `Production guard: APP_ENV=qa אסור ב-${source}. השתמשי ב-build:qa לסביבת QA.`,
    );
  }

  const url = String(env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  if (!url) {
    throw new Error(`Production guard: חסר NEXT_PUBLIC_SUPABASE_URL ב-${source}`);
  }
  const lowered = url.toLowerCase();
  for (const marker of QA_URL_MARKERS) {
    if (lowered.includes(marker)) {
      throw new Error(
        `Production guard: זוהה QA Supabase URL (${url}) ב-${source}. מסרב לבנות/להעלות Production.`,
      );
    }
  }
  if (!/^https:\/\/supabase\.mashachachti\.co\.il\/?$/i.test(url)) {
    throw new Error(
      `Production guard: NEXT_PUBLIC_SUPABASE_URL חייב להיות https://supabase.mashachachti.co.il (קיבל: ${url})`,
    );
  }

  if (String(env.NEXT_DIST_DIR ?? "").trim() === ".next-qa") {
    throw new Error(
      "Production guard: NEXT_DIST_DIR=.next-qa אסור ב-Production build.",
    );
  }
}

export function applyProductionEnv(envFile = ENV_FILE) {
  // Shell/export leftovers from a prior QA session must not override production bake.
  const poisoned = [];
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("NEXT_PUBLIC_") && key !== "APP_ENV" && key !== "NEXT_DIST_DIR") {
      continue;
    }
    const v = String(value || "");
    if (
      v.toLowerCase() === "qa" ||
      QA_URL_MARKERS.some((m) => v.toLowerCase().includes(m)) ||
      v === ".next-qa"
    ) {
      poisoned.push(`${key}=${v}`);
      delete process.env[key];
    }
  }
  if (poisoned.length) {
    console.warn(
      `[prod-env] ניקוי משתני QA מה-shell לפני bake:\n  ${poisoned.join("\n  ")}`,
    );
  }

  const fileEnv = parseEnvFile(envFile);
  assertProductionSafe(fileEnv, { source: envFile });

  for (const [key, value] of Object.entries(fileEnv)) {
    process.env[key] = value;
  }
  process.env.APP_ENV = "production";
  delete process.env.NEXT_DIST_DIR;
  process.env.MA_SHACHACHTI_PRODUCTION_BUILD = "1";

  assertProductionSafe(
    {
      APP_ENV: process.env.APP_ENV,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_DIST_DIR: process.env.NEXT_DIST_DIR,
    },
    { source: "process.env after load" },
  );
  return {
    envFile,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const loaded = applyProductionEnv();
  console.log(`OK production env from ${loaded.envFile}`);
  console.log(`NEXT_PUBLIC_SUPABASE_URL=${loaded.supabaseUrl}`);
  console.log("APP_ENV=production");
}
