import { test } from "@playwright/test";

/**
 * Real agent chat needs cloud + OpenAI. Local demoReply is not acceptance for P76–P78.
 */
test.describe("chat", () => {
  test.skip("cloud agent chat — skipped: requires authenticated cloud + OpenAI credentials", async () => {});
});
