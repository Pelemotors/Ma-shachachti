import test from "node:test";
import assert from "node:assert/strict";
import { ERROR_CODES, ERROR_MESSAGES_HE, messageForCode } from "../lib/errors";
import * as domain from "../lib/domain";
import { stampMs, isHiddenUntilFuture, msUntil } from "../lib/time";

test("P56 domain barrel exports key modules", () => {
  assert.equal(typeof domain.analyzeScanText, "function");
  assert.equal(typeof domain.getForgottenCandidates, "function");
  assert.equal(typeof domain.evaluateNotificationPolicy, "function");
  assert.equal(typeof domain.buildLifeAdminDigest, "function");
  assert.equal(typeof domain.isActiveVisibleTask, "function");
  assert.equal(typeof domain.findSemanticDuplicate, "function");
  assert.equal(typeof domain.applyActions, "function");
});

test("P62 error codes include recorder/scan/conflict and Hebrew map", () => {
  for (const code of [
    "microphone_denied",
    "transcription_failed",
    "scan_analysis_failed",
    "revision_conflict",
  ] as const) {
    assert.ok(ERROR_CODES.includes(code));
    assert.ok(ERROR_MESSAGES_HE[code].length > 5);
    assert.equal(messageForCode(code), ERROR_MESSAGES_HE[code]);
  }
});

test("P61 time helpers for hiddenUntil / due windows", () => {
  const now = new Date("2026-09-07T10:00:00+03:00");
  const future = "2026-09-07T12:00:00+03:00";
  const past = "2026-09-07T08:00:00+03:00";
  assert.equal(isHiddenUntilFuture(future, now), true);
  assert.equal(isHiddenUntilFuture(past, now), false);
  assert.equal(isHiddenUntilFuture(null, now), false);
  assert.ok(msUntil(future, now) > 0);
  assert.ok(Number.isFinite(stampMs(past)));
});
