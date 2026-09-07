import { test } from "@playwright/test";

/**
 * P76–P78: recorder + Notification/Mic permission pairing.
 *
 * Chromium in CI/headless cannot grant durable Notification or getUserMedia
 * the way a real user device does. Faking permissions would not prove the
 * product path (independent pair, consent gates, transcription).
 * Do not claim PASS.
 */
test.describe("P76–P78 recorder / permissions", () => {
  test.skip("P76: mic recorder start/finish/send — requires real getUserMedia; unavailable as durable grant in CI Chromium", async () => {});

  test.skip("P77: Notification.requestPermission + mic pair (P43) — browser permission prompts are not grantable in this CI runner", async () => {});

  test.skip("P78: voice transcription after consent — needs cloud auth + OpenAI + mic; local demo disables composer mic by design", async () => {});
});
