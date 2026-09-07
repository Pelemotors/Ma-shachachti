import { test } from "@playwright/test";

/**
 * Cloud auth E2E needs a dedicated staging project + test user fixtures.
 * Local demo covers product-critical paths in p70–p75; do not fake auth PASS.
 */
test.describe("auth (cloud)", () => {
  test.skip("P-auth: cloud login / session restore — skipped: no staging auth fixtures (Supabase test user + secrets) in this runner", async () => {});
});
