import assert from "node:assert/strict";
import { test } from "node:test";
import { CHAT_SURFACES, HOME_SURFACES } from "../lib/home-surfaces.ts";

test("home surfaces keep the approved order and share one agent", () => {
  assert.deepEqual(
    HOME_SURFACES.map((surface) => surface.title),
    ["מיקוד", "צור לי לו״ז להיום", "יש לי זמן פנוי"],
  );
  assert.equal(HOME_SURFACES.length, 3);
  assert.deepEqual(HOME_SURFACES.map((surface) => surface.id), [
    "focus",
    "schedule",
    "free-time",
  ]);
  assert.ok(CHAT_SURFACES.includes("forgotten"));
  for (const surface of HOME_SURFACES) {
    assert.ok(surface.objective.includes(surface.title));
  }
});
