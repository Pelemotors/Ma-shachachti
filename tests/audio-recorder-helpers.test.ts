import test from "node:test";
import assert from "node:assert/strict";
import {
  canFinishRecording,
  canSendTranscript,
  canStartRecording,
  emptyLevels,
  formatRecordingClock,
  mergePermissionNotices,
  shouldKeepBlobAfterTranscribe,
  type RecorderPhase,
} from "../lib/audio/recorder-helpers";

test("P46/P53 recorder guards: start/finish/send locks", () => {
  const phases: RecorderPhase[] = [
    "idle",
    "requesting_permission",
    "recording",
    "preview",
    "transcribing",
    "error",
  ];
  assert.equal(canStartRecording("idle", false), true);
  assert.equal(canStartRecording("idle", true), false);
  assert.equal(canStartRecording("recording", false), false);
  assert.equal(canStartRecording("error", false), true);
  assert.equal(canFinishRecording("recording"), true);
  assert.equal(canFinishRecording("preview"), false);
  assert.equal(canSendTranscript("preview", true, false), true);
  assert.equal(canSendTranscript("preview", true, true), false);
  assert.equal(canSendTranscript("preview", false, false), false);
  assert.equal(canSendTranscript("error", true, false), true);
  assert.equal(canSendTranscript("transcribing", true, false), false);
  for (const p of phases) {
    assert.equal(typeof p, "string");
  }
});

test("P51/P52 blob retention after transcribe", () => {
  assert.equal(shouldKeepBlobAfterTranscribe(true), false);
  assert.equal(shouldKeepBlobAfterTranscribe(false), true);
});

test("P47 clock formatting and empty waveform levels", () => {
  assert.equal(formatRecordingClock(0), "00:00");
  assert.equal(formatRecordingClock(24), "00:24");
  assert.equal(formatRecordingClock(90), "01:30");
  assert.equal(formatRecordingClock(-3), "00:00");
  const levels = emptyLevels(16);
  assert.equal(levels.length, 16);
  assert.ok(levels.every((n) => n === 0.1));
});

test("P43 independent permission notices do not cancel each other", () => {
  assert.equal(
    mergePermissionNotices({
      notification: "granted",
      microphone: "denied",
    }).notice?.includes("מיקרופון"),
    true,
  );
  const micOnly = mergePermissionNotices({
    notification: "denied",
    microphone: "granted",
  });
  assert.equal(micOnly.notice, "מיקרופון אושר.");
  assert.ok(micOnly.error);
  const bothDenied = mergePermissionNotices({
    notification: "denied",
    microphone: "denied",
  });
  assert.ok(bothDenied.error);
  assert.equal(bothDenied.notice, undefined);
});

/*
 * Browser-only gaps (not covered here):
 * - MediaRecorder / getUserMedia / AnalyserNode waveform loop
 * - AudioContext close + track.stop cleanup on unmount
 * - Object URL preview playback
 * - /api/transcribe network path
 */
