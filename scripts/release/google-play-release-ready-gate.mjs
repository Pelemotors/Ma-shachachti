#!/usr/bin/env node
/**
 * Android / Google Play CODE/CONFIG readiness.
 * Does not claim a human device test. Apple Sign-In does not block Android.
 */
const androidClient = Boolean(process.env.GOOGLE_ANDROID_CLIENT_ID?.trim());
const webClient = Boolean(
  process.env.GOOGLE_WEB_CLIENT_ID?.trim() || process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim(),
);
const calendar = Boolean(
  process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() &&
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() &&
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY?.trim(),
);

const missing = [];
if (!androidClient) missing.push("GOOGLE_ANDROID_CLIENT_ID");
if (!webClient) missing.push("GOOGLE_WEB_CLIENT_ID or GOOGLE_CALENDAR_CLIENT_ID");
if (!calendar) missing.push("GOOGLE_CALENDAR_CLIENT_ID + GOOGLE_CALENDAR_CLIENT_SECRET + CALENDAR_TOKEN_ENCRYPTION_KEY");

if (missing.length) {
  console.error("PLAY_RELEASE_READY_GATE_FAIL CODE/CONFIG READY:");
  for (const item of missing) console.error(` - ${item}`);
  console.error("HUMAN DEVICE TEST PASSED: not claimed by this gate.");
  process.exit(1);
}

console.log("PLAY_RELEASE_READY_GATE_PASS CODE/CONFIG READY");
console.log("HUMAN DEVICE TEST PASSED: not claimed — requires a physical Android test.");
