import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { applyProductionEnv, assertProductionSafe } from "../scripts/load-production-env.mjs";

test("production guard rejects QA supabase URL", () => {
  assert.throws(
    () =>
      assertProductionSafe({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:8011",
        APP_ENV: "production",
      }),
    /QA Supabase URL/,
  );
});

test("production guard rejects APP_ENV=qa", () => {
  assert.throws(
    () =>
      assertProductionSafe({
        NEXT_PUBLIC_SUPABASE_URL: "https://supabase.mashachachti.co.il",
        APP_ENV: "qa",
      }),
    /APP_ENV=qa/,
  );
});

test("production guard accepts production supabase URL", () => {
  assert.doesNotThrow(() =>
    assertProductionSafe({
      NEXT_PUBLIC_SUPABASE_URL: "https://supabase.mashachachti.co.il",
      APP_ENV: "production",
    }),
  );
});

test("applyProductionEnv loads a production env file and clears QA leftovers", () => {
  const prev = {
    APP_ENV: process.env.APP_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_DIST_DIR: process.env.NEXT_DIST_DIR,
    MA_SHACHACHTI_PRODUCTION_BUILD: process.env.MA_SHACHACHTI_PRODUCTION_BUILD,
  };
  const dir = mkdtempSync(join(tmpdir(), "prod-env-"));
  const fixture = join(dir, "production.env");
  writeFileSync(
    fixture,
    "APP_ENV=production\nNEXT_PUBLIC_SUPABASE_URL=https://supabase.mashachachti.co.il\n",
    "utf8",
  );
  process.env.APP_ENV = "qa";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:8011";
  process.env.NEXT_DIST_DIR = ".next-qa";
  try {
    const loaded = applyProductionEnv(fixture);
    assert.match(loaded.supabaseUrl, /supabase\.mashachachti\.co\.il/);
    assert.equal(process.env.APP_ENV, "production");
    assert.equal(process.env.MA_SHACHACHTI_PRODUCTION_BUILD, "1");
    assert.equal(process.env.NEXT_DIST_DIR, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
