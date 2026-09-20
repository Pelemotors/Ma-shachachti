#!/usr/bin/env node
/**
 * FAIL until live Google Sign-In, Apple Sign-In, and Calendar Sync work.
 * Missing credentials is a hard fail — not a Code Deploy blocker.
 */
const google = Boolean(process.env.GOOGLE_NATIVE_CLIENT_ID);
const apple = Boolean(process.env.APPLE_NATIVE_CLIENT_ID || process.env.APPLE_CLIENT_ID);
const calendar = Boolean(
  process.env.GOOGLE_CALENDAR_CLIENT_ID &&
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET &&
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY,
);

const missing = [];
if (!google) missing.push("GOOGLE_NATIVE_CLIENT_ID");
if (!apple) missing.push("APPLE_NATIVE_CLIENT_ID");
if (!calendar) missing.push("GOOGLE_CALENDAR_* / CALENDAR_TOKEN_ENCRYPTION_KEY");

if (missing.length) {
  console.error("PLAY_RELEASE_READY_GATE_FAIL HUMAN RELEASE CHECK:");
  for (const item of missing) console.error(` - ${item}`);
  process.exit(1);
}

console.log("PLAY_RELEASE_READY_GATE_PASS");
