import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  assertRunnerChangedPaths,
  isProtectedRunnerPath,
  scrubRunnerEnvironment,
  validateSmithRunnerInput,
} from "../lib/smith/runner-policy.ts";

const id = "123e4567-e89b-42d3-a456-426614174000";
const valid = {
  workItemId: id,
  branch: `smith/${id}-bounded-change`,
  baseSha: "a".repeat(40),
  iteration: 0,
  objective: "Fix a bounded UI issue.",
  diagnosis: "The verified component state is stale.",
  allowedPaths: ["components/example", "tests/example.test.ts"],
};

test("runner input requires a bounded Smith branch and path list", () => {
  assert.deepEqual(validateSmithRunnerInput(valid), valid);
  assert.throws(() => validateSmithRunnerInput({ ...valid, branch: "main" }));
  assert.throws(() => validateSmithRunnerInput({ ...valid, allowedPaths: [] }));
  assert.throws(() => validateSmithRunnerInput({ ...valid, iteration: 3 }));
});

test("runner rejects sensitive and out-of-scope changes", () => {
  for (const path of [
    ".github/workflows/ci.yml",
    "supabase/migrations/one.sql",
    "database/migrations/one.sql",
    "lib/server-auth.ts",
    "lib/smith/production-gate.ts",
    "vercel.json",
  ]) {
    assert.equal(isProtectedRunnerPath(path), true, path);
  }
  assert.doesNotThrow(() =>
    assertRunnerChangedPaths(
      ["components/example/card.tsx"],
      valid.allowedPaths,
    ),
  );
  assert.throws(() =>
    assertRunnerChangedPaths(
      ["app/api/production/route.ts"],
      valid.allowedPaths,
    ),
  );
});

test("runner subprocess environment removes ambient credentials", () => {
  const environment: NodeJS.ProcessEnv = {
    CURSOR_API_KEY: "cursor-test",
    GITHUB_TOKEN: "github-test",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid",
    VERCEL_ACCESS_TOKEN: "vercel-test",
    SAFE_FLAG: "true",
  };
  assert.equal(scrubRunnerEnvironment(environment), "cursor-test");
  assert.deepEqual(environment, { SAFE_FLAG: "true" });
});

test("runner executable fails closed while disconnected", () => {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/smith-runner.ts", "missing.json"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, SMITH_RUNNER_ENABLED: "false" },
    },
  );
  assert.equal(result.status, 78);
  assert.match(result.stderr, /Smith Runner is DISCONNECTED/);
  assert.doesNotMatch(result.stdout, /runId/);
});
