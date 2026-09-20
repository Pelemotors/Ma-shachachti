import assert from "node:assert/strict";
import { test } from "node:test";
import { runSmoke } from "../cli/smoke.ts";

test("deterministic replay produces the same normalized hash", async () => {
  const result = await runSmoke();
  assert.equal(result.hash, result.first.summary.normalizedHash);
  assert.equal(result.first.summary.normalizedHash, result.second.summary.normalizedHash);
  assert.equal(result.first.timeline.length, result.second.timeline.length);
});
