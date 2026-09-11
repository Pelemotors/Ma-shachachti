export type RetentionRecording = {
  status: "uploading" | "processing" | "ready" | "error";
  storage_path: string | null;
  delete_after: string | null;
};

export const RECORDING_STALE_AFTER_MS = 2 * 60 * 1000;

export type RecoverableRecording = {
  status: "uploading" | "processing" | "ready" | "error";
  storage_path: string | null;
  updated_at: string;
  processing_token: string | null;
};

export type RecordingRecoveryDecision =
  | { kind: "ready" }
  | { kind: "locked" }
  | { kind: "claim"; source: "stored" | "upload" };

export function classifyOrphanObject(
  existing: { size: number; mime: string } | null,
  expected: { size: number; mime: string },
) {
  if (!existing) return "retry" as const;
  if (
    existing.size === expected.size &&
    existing.mime === expected.mime
  ) {
    return "reuse" as const;
  }
  return "replace" as const;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function recordingPath(userId: string, id: string, mime: string) {
  if (!UUID_RE.test(userId) || !UUID_RE.test(id)) {
    throw new Error("invalid_recording_id");
  }
  const extensions: Record<string, string> = {
    "audio/webm": "webm",
    "audio/mp4": "mp4",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
  };
  const extension = extensions[mime];
  if (!extension) throw new Error("invalid_recording_mime");
  return `${userId}/${id}.${extension}`;
}

export function readyTimes(now = new Date()) {
  const processedAt = now.toISOString();
  return {
    processed_at: processedAt,
    delete_after: new Date(
      now.getTime() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString(),
  };
}

export function isAudioRetentionDue(
  recording: RetentionRecording,
  now = new Date(),
) {
  if (
    recording.status !== "ready" ||
    !recording.storage_path ||
    !recording.delete_after
  ) {
    return false;
  }
  const due = new Date(recording.delete_after).getTime();
  return Number.isFinite(due) && due <= now.getTime();
}

export function isRecordingClaimStale(
  updatedAt: string,
  now = new Date(),
  staleAfterMs = RECORDING_STALE_AFTER_MS,
) {
  const updated = new Date(updatedAt).getTime();
  return (
    Number.isFinite(updated) &&
    now.getTime() - updated >= Math.max(1, staleAfterMs)
  );
}

export function classifyRecordingRecovery(
  recording: RecoverableRecording,
  now = new Date(),
  staleAfterMs = RECORDING_STALE_AFTER_MS,
): RecordingRecoveryDecision {
  if (recording.status === "ready") return { kind: "ready" };
  if (
    (recording.status === "uploading" ||
      recording.status === "processing") &&
    !isRecordingClaimStale(recording.updated_at, now, staleAfterMs)
  ) {
    return { kind: "locked" };
  }
  return {
    kind: "claim",
    source: recording.storage_path ? "stored" : "upload",
  };
}

export function applyRecordingRecoveryClaim<T extends RecoverableRecording>(
  recording: T,
  token: string,
  now = new Date(),
  staleAfterMs = RECORDING_STALE_AFTER_MS,
) {
  const decision = classifyRecordingRecovery(recording, now, staleAfterMs);
  if (decision.kind !== "claim") return { decision, recording };
  return {
    decision,
    recording: {
      ...recording,
      status: decision.source === "stored" ? "processing" : "uploading",
      processing_token: token,
      updated_at: now.toISOString(),
    } as T,
  };
}
