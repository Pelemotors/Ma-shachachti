import { test } from "@playwright/test";

/**
 * Shopping cloud sync needs staging auth. Local shopping UI is not in P70–P78
 * critical path; avoid soft-pass empty assertions.
 */
test.describe("shopping", () => {
  test.skip("shopping list cloud round-trip — skipped: no staging auth fixtures", async () => {});
});
