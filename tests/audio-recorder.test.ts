import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appendTranscript,
  canFinishRecording,
  canSendTranscript,
  canStartRecording,
  emptyLevels,
  formatRecordingClock,
  inspectTranscriptionAudio,
  normalizeRecordedBlobType,
  pickRecorderMimeType,
  recordedMimeBase,
  shouldKeepBlobAfterTranscribe,
  transcriptionModelFromEnv,
  type RecorderPhase,
} from "../lib/audio/recorder-helpers.ts";

test("recorder guards: start, finish, send, and retry after error", () => {
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
  for (const phase of phases) assert.equal(typeof phase, "string");
});

test("failed transcription keeps the blob so the user can retry", () => {
  assert.equal(shouldKeepBlobAfterTranscribe(true), false);
  assert.equal(shouldKeepBlobAfterTranscribe(false), true);
});

test("clock formatting and empty waveform levels", () => {
  assert.equal(formatRecordingClock(0), "00:00");
  assert.equal(formatRecordingClock(24), "00:24");
  assert.equal(formatRecordingClock(90), "01:30");
  assert.equal(formatRecordingClock(-3), "00:00");
  const levels = emptyLevels(16);
  assert.equal(levels.length, 16);
  assert.ok(levels.every((value) => value === 0.1));
});

test("transcript is appended to existing draft text and is not an auto-send", () => {
  assert.equal(appendTranscript("", "  שלום  "), "שלום");
  assert.equal(appendTranscript("קניות", "חלב"), "קניות חלב");
  assert.equal(appendTranscript("  קניות  ", "  חלב "), "קניות חלב");
  assert.equal(appendTranscript("קניות", "   "), "קניות");
});

test("transcription audio mime and size are validated", () => {
  assert.equal(
    inspectTranscriptionAudio({
      contentLength: 12,
      size: 12,
      mime: "audio/webm",
    }).ok,
    true,
  );
  assert.equal(
    inspectTranscriptionAudio({
      contentLength: 12,
      size: 12,
      mime: "audio/mp4;codecs=aac",
    }).ok,
    true,
  );
  assert.equal(
    inspectTranscriptionAudio({
      contentLength: 12,
      size: 12,
      mime: "audio/ogg",
    }).ok,
    true,
  );
  assert.equal(
    inspectTranscriptionAudio({
      contentLength: 12,
      size: 12,
      mime: "audio/wav",
    }).ok,
    true,
  );
  const invalid = inspectTranscriptionAudio({
    contentLength: 12,
    size: 12,
    mime: "video/avi",
  });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.status, 400);
  const safari = inspectTranscriptionAudio({
    contentLength: 12,
    size: 12,
    mime: "video/mp4",
  });
  assert.equal(safari.ok, true);
  if (safari.ok) {
    assert.equal(safari.mime, "audio/mp4");
    assert.equal(safari.filename, "recording.mp4");
  }
  const emptyMime = inspectTranscriptionAudio({
    contentLength: 12,
    size: 12,
    mime: "",
  });
  assert.equal(emptyMime.ok, false);
  const large = inspectTranscriptionAudio({
    contentLength: 11_000_000,
    size: 11_000_000,
    mime: "audio/webm",
  });
  assert.equal(large.ok, false);
  if (!large.ok) assert.equal(large.status, 413);
});

test("Safari MediaRecorder mime types are normalized without inventing a model", () => {
  assert.equal(recordedMimeBase("video/mp4"), "audio/mp4");
  assert.equal(recordedMimeBase("audio/mp4;codecs=mp4a.40.2"), "audio/mp4");
  assert.equal(recordedMimeBase("audio/webm;codecs=opus"), "audio/webm");
  assert.equal(normalizeRecordedBlobType("video/mp4"), "audio/mp4");
  assert.equal(normalizeRecordedBlobType("", "audio/mp4"), "audio/mp4");
  assert.equal(normalizeRecordedBlobType("", "audio/webm;codecs=opus"), "audio/webm");
  assert.equal(
    pickRecorderMimeType((type) => type === "audio/mp4"),
    "audio/mp4",
  );
  assert.equal(
    pickRecorderMimeType((type) => type.startsWith("audio/webm")),
    "audio/webm;codecs=opus",
  );
  assert.equal(
    pickRecorderMimeType(() => false),
    undefined,
  );
});

test("transcription model is not invented when missing", () => {
  assert.equal(transcriptionModelFromEnv(""), null);
  assert.equal(transcriptionModelFromEnv("   "), null);
  assert.equal(transcriptionModelFromEnv("PUT_TRANSCRIPTION_MODEL_HERE"), null);
  assert.equal(transcriptionModelFromEnv("whisper-1"), "whisper-1");
});
