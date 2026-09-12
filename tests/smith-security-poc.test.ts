import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260912131459_smith_security_poc.sql",
  "utf8",
);
const config = readFileSync("supabase/config.toml", "utf8");
const runner = readFileSync("scripts/smith-security-poc.mjs", "utf8");

test("smith_test is a non-login, non-inheriting, unprivileged role", () => {
  assert.match(
    migration,
    /create role smith_test[\s\S]*nologin[\s\S]*noinherit/i,
  );
  assert.match(migration, /nosuperuser/i);
  assert.match(migration, /nocreatedb/i);
  assert.match(migration, /nocreaterole/i);
  assert.match(migration, /noreplication/i);
  assert.match(migration, /grant smith_test to authenticator/i);
  assert.match(
    migration,
    /revoke smith_test from anon, authenticated, service_role/i,
  );
});

test("custom access token hook trusts app_metadata and not user_metadata", () => {
  assert.match(
    migration,
    /claims #>> '\{app_metadata,environment\}' = 'smith_test'/,
  );
  assert.doesNotMatch(migration, /user_metadata,environment/);
  assert.match(
    migration,
    /revoke execute on function public\.smith_test_access_token_hook\(jsonb\)[\s\S]*from public, anon, authenticated, smith_test/i,
  );
  assert.match(
    config,
    /\[auth\.hook\.custom_access_token\][\s\S]*enabled = true/,
  );
});

test("local API routing exposes smith_test without treating it as the boundary", () => {
  assert.match(config, /schemas = \[[^\]]*"smith_test"/);
  assert.match(migration, /revoke all on schema smith_test from public/i);
  assert.match(migration, /grant usage on schema smith_test to smith_test/i);
  assert.match(migration, /force row level security/i);
});

test("POC runner refuses non-local Supabase and persists no credentials", () => {
  assert.match(runner, /Refusing to run against a non-local Supabase URL/);
  assert.match(runner, /secretsPersisted: false/);
  assert.doesNotMatch(runner, /qammtrqpnapmeerskhns/);
  assert.doesNotMatch(runner, /SUPABASE_SERVICE_ROLE_KEY\s*=/);
});
