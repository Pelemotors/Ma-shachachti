import { test } from "@playwright/test";

/**
 * Daily plan duration wheel covered in smoke (P69). Full plan persistence with
 * conflict/replan is unit-tested; cloud plan sync needs staging auth.
 */
test.describe("planning", () => {
  test.skip("cloud daily-plan conflict/replan UI — skipped: no staging auth; engine covered in unit tests", async () => {});
});
