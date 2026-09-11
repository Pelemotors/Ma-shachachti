import type { SupabaseClient } from "@supabase/supabase-js";
import { UUID_RE } from "./action-schema.ts";
import { HttpError } from "./server-auth.ts";
import {
  inspectAudioBlob,
  transcribeAudio,
} from "./audio/transcription-service.ts";
import {
  classifyOrphanObject,
  classifyRecordingRecovery,
  readyTimes,
  recordingPath,
} from "./audio/recording-bank-helpers.ts";

export {
  isAudioRetentionDue,
  readyTimes,
  recordingPath,
} from "./audio/recording-bank-helpers.ts";

export const RECORDINGS_BUCKET = "recordings";
export const RECORDING_SELECT =
  "id,status,storage_path,mime,size,duration_seconds,transcript,error_code,error_message,created_at,updated_at,processed_at,delete_after,audio_deleted_at,processing_token";

export type RecordingRow = {
  id: string;
  user_id?: string;
  status: "uploading" | "processing" | "ready" | "error";
  storage_path: string | null;
  mime: string;
  size: number;
  duration_seconds: number;
  transcript: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
  delete_after: string | null;
  audio_deleted_at: string | null;
  processing_token: string | null;
};

export function recordingId(value: string | null) {
  if (!value || !UUID_RE.test(value)) {
    throw new HttpError(400, "מזהה ההקלטה אינו תקין.");
  }
  return value;
}

export function recordingDuration(value: string | null) {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration < 0 || duration > 90) {
    throw new HttpError(400, "משך ההקלטה אינו תקין.");
  }
  return Math.round(duration * 1000) / 1000;
}

function safeFailure(error: unknown) {
  if (error instanceof HttpError && error.status === 503) {
    return {
      code: "transcription_unavailable",
      message: error.message.slice(0, 240),
    };
  }
  return {
    code: "transcription_failed",
    message: "לא הצלחנו לתמלל. אפשר לנסות שוב.",
  };
}

async function canonical(
  db: SupabaseClient,
  userId: string,
  id: string,
): Promise<RecordingRow> {
  const { data, error } = await db
    .from("recordings")
    .select(RECORDING_SELECT)
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new HttpError(503, "לא הצלחנו לטעון את ההקלטה.");
  if (!data) throw new HttpError(404, "ההקלטה לא נמצאה.");
  return data as RecordingRow;
}

export async function processRecordingBlob(
  db: SupabaseClient,
  userId: string,
  id: string,
  blob: Blob,
  processingToken: string,
): Promise<RecordingRow> {
  const inspected = inspectAudioBlob(blob);
  try {
    const transcript = await transcribeAudio(blob, inspected);
    const times = readyTimes();
    const { data, error } = await db
      .from("recordings")
      .update({
        status: "ready",
        transcript,
        error_code: null,
        error_message: null,
        processing_token: null,
        updated_at: times.processed_at,
        ...times,
      })
      .eq("user_id", userId)
      .eq("id", id)
      .eq("status", "processing")
      .eq("processing_token", processingToken)
      .select(RECORDING_SELECT)
      .maybeSingle();
    if (error || !data) {
      throw new HttpError(503, "לא הצלחנו לשמור את התמלול.");
    }
    return data as RecordingRow;
  } catch (error) {
    const failure = safeFailure(error);
    const now = new Date().toISOString();
    await db
      .from("recordings")
      .update({
        status: "error",
        error_code: failure.code,
        error_message: failure.message,
        updated_at: now,
        processed_at: null,
        delete_after: null,
        processing_token: null,
      })
      .eq("user_id", userId)
      .eq("id", id)
      .eq("status", "processing")
      .eq("processing_token", processingToken);
    throw error;
  }
}

async function markClaimError(
  db: SupabaseClient,
  userId: string,
  id: string,
  token: string,
  code: string,
  message: string,
) {
  await db
    .from("recordings")
    .update({
      status: "error",
      error_code: code.slice(0, 64),
      error_message: message.slice(0, 240),
      processing_token: null,
      updated_at: new Date().toISOString(),
      processed_at: null,
      delete_after: null,
    })
    .eq("user_id", userId)
    .eq("id", id)
    .eq("processing_token", token);
}

export async function claimRecording(
  db: SupabaseClient,
  userId: string,
  current: RecordingRow,
  upload?: { mime: string; size: number; durationSeconds: number },
) {
  const decision = classifyRecordingRecovery(current);
  if (decision.kind === "ready") {
    return { kind: "ready" as const, recording: current };
  }
  if (decision.kind === "locked") {
    throw new HttpError(409, "ההקלטה כבר בתהליך תמלול.");
  }
  if (decision.source === "upload" && !upload) {
    throw new HttpError(409, "קובץ האודיו חסר. יש לנסות שוב מההקלטה המקורית.");
  }

  const token = crypto.randomUUID();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: decision.source === "stored" ? "processing" : "uploading",
    processing_token: token,
    error_code: null,
    error_message: null,
    updated_at: now,
    processed_at: null,
    delete_after: null,
  };
  if (decision.source === "upload" && upload) {
    Object.assign(patch, {
      storage_path: null,
      audio_deleted_at: null,
      mime: upload.mime,
      size: upload.size,
      duration_seconds: upload.durationSeconds,
    });
  }

  let query = db
    .from("recordings")
    .update(patch)
    .eq("user_id", userId)
    .eq("id", current.id)
    .eq("status", current.status)
    .eq("updated_at", current.updated_at);
  query = current.processing_token
    ? query.eq("processing_token", current.processing_token)
    : query.is("processing_token", null);
  const { data, error } = await query
    .select(RECORDING_SELECT)
    .maybeSingle();
  if (error) throw new HttpError(503, "לא הצלחנו לתפוס את ההקלטה לעיבוד.");
  if (!data) {
    const latest = await canonical(db, userId, current.id);
    if (latest.status === "ready") {
      return { kind: "ready" as const, recording: latest };
    }
    throw new HttpError(409, "ההקלטה כבר בתהליך תמלול.");
  }
  return {
    kind: "claimed" as const,
    source: decision.source,
    token,
    recording: data as RecordingRow,
  };
}

async function finishUploadClaim(
  db: SupabaseClient,
  userId: string,
  id: string,
  token: string,
  path: string,
) {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("recordings")
    .update({
      status: "processing",
      storage_path: path,
      updated_at: now,
    })
    .eq("user_id", userId)
    .eq("id", id)
    .eq("status", "uploading")
    .eq("processing_token", token)
    .select(RECORDING_SELECT)
    .maybeSingle();
  if (error || !data) {
    throw new HttpError(409, "תפיסת העיבוד של ההקלטה פגה.");
  }
  return data as RecordingRow;
}

export async function uploadClaimedRecording(
  db: SupabaseClient,
  userId: string,
  id: string,
  token: string,
  blob: Blob,
) {
  const inspected = inspectAudioBlob(blob);
  const path = recordingPath(userId, id, inspected.mime);
  const bucket = db.storage.from(RECORDINGS_BUCKET);
  const uploaded = await bucket.upload(path, blob, {
    contentType: inspected.mime,
    upsert: false,
  });
  if (!uploaded.error) {
    await finishUploadClaim(db, userId, id, token, path);
    return processRecordingBlob(db, userId, id, blob, token);
  }

  // The previous request may have completed Storage but died before persisting
  // the path. Reuse only the deterministic owner/id object with identical bytes.
  const existing = await bucket.download(path);
  let existingAudio: { size: number; mime: string } | null = null;
  if (!existing.error && existing.data) {
    try {
      existingAudio = {
        size: existing.data.size,
        mime: inspectAudioBlob(existing.data).mime,
      };
    } catch {
      existingAudio = { size: existing.data.size, mime: "" };
    }
  }
  const orphanDecision = classifyOrphanObject(existingAudio, {
    size: blob.size,
    mime: inspected.mime,
  });
  if (!existing.error && existing.data && orphanDecision === "reuse") {
    await finishUploadClaim(db, userId, id, token, path);
    return processRecordingBlob(db, userId, id, existing.data, token);
  }

  if (
    !existing.error &&
    existing.data &&
    orphanDecision === "replace"
  ) {
    const removed = await bucket.remove([path]);
    if (!removed.error) {
      const replacement = await bucket.upload(path, blob, {
        contentType: inspected.mime,
        upsert: false,
      });
      if (!replacement.error) {
        await finishUploadClaim(db, userId, id, token, path);
        return processRecordingBlob(db, userId, id, blob, token);
      }
    }
  }

  await markClaimError(
    db,
    userId,
    id,
    token,
    "audio_upload_failed",
    "לא הצלחנו להעלות את ההקלטה.",
  );
  throw new HttpError(503, "לא הצלחנו להעלות את ההקלטה.");
}

export async function resumeRecordingWithBlob(
  db: SupabaseClient,
  userId: string,
  current: RecordingRow,
  blob: Blob,
  durationSeconds: number,
) {
  const inspected = inspectAudioBlob(blob);
  const claim = await claimRecording(db, userId, current, {
    mime: inspected.mime,
    size: blob.size,
    durationSeconds,
  });
  if (claim.kind === "ready") return claim.recording;
  if (claim.source === "upload") {
    return uploadClaimedRecording(
      db,
      userId,
      current.id,
      claim.token,
      blob,
    );
  }

  const path = claim.recording.storage_path;
  if (!path) {
    await markClaimError(
      db,
      userId,
      current.id,
      claim.token,
      "audio_missing",
      "קובץ האודיו חסר.",
    );
    throw new HttpError(409, "קובץ האודיו חסר.");
  }
  const stored = await db.storage.from(RECORDINGS_BUCKET).download(path);
  if (!stored.error && stored.data) {
    return processRecordingBlob(
      db,
      userId,
      current.id,
      stored.data,
      claim.token,
    );
  }

  // A row can point at an object whose upload never became durable. A POST
  // still has the original client blob, so repair it under the current claim.
  const { error: clearError } = await db
    .from("recordings")
    .update({
      status: "uploading",
      storage_path: null,
      processing_token: claim.token,
      updated_at: new Date().toISOString(),
      mime: inspected.mime,
      size: blob.size,
      duration_seconds: durationSeconds,
    })
    .eq("user_id", userId)
    .eq("id", current.id)
    .eq("status", "processing")
    .eq("processing_token", claim.token);
  if (clearError) {
    throw new HttpError(503, "לא הצלחנו לשחזר את ההקלטה.");
  }
  return uploadClaimedRecording(
    db,
    userId,
    current.id,
    claim.token,
    blob,
  );
}

export async function retryRecording(
  db: SupabaseClient,
  userId: string,
  id: string,
) {
  const current = await canonical(db, userId, id);
  const claim = await claimRecording(db, userId, current);
  if (claim.kind === "ready") return claim.recording;
  const path = claim.recording.storage_path;
  if (!path) throw new HttpError(409, "קובץ האודיו כבר אינו זמין.");
  const { data, error } = await db.storage
    .from(RECORDINGS_BUCKET)
    .download(path);
  if (error || !data) {
    await markClaimError(
      db,
      userId,
      id,
      claim.token,
      "audio_download_failed",
      "לא הצלחנו לקרוא את קובץ האודיו.",
    );
    throw new HttpError(503, "לא הצלחנו לקרוא את קובץ האודיו.");
  }
  return processRecordingBlob(db, userId, id, data, claim.token);
}

export async function deleteRecording(
  db: SupabaseClient,
  userId: string,
  id: string,
  audioOnly: boolean,
) {
  const row = await canonical(db, userId, id);
  if (row.storage_path) {
    const { error } = await db.storage
      .from(RECORDINGS_BUCKET)
      .remove([row.storage_path]);
    if (error) throw new HttpError(503, "לא הצלחנו למחוק את קובץ האודיו.");
    const deletedAt = new Date().toISOString();
    const { error: updateError } = await db
      .from("recordings")
      .update({
        storage_path: null,
        audio_deleted_at: deletedAt,
        updated_at: deletedAt,
      })
      .eq("user_id", userId)
      .eq("id", id);
    if (updateError) {
      throw new HttpError(503, "האודיו נמחק, אך עדכון הרשומה נכשל.");
    }
  }
  if (!audioOnly) {
    const { error } = await db
      .from("recordings")
      .delete()
      .eq("user_id", userId)
      .eq("id", id);
    if (error) throw new HttpError(503, "לא הצלחנו למחוק את ההקלטה.");
  }
}

export async function cleanupExpiredRecordings(
  db: SupabaseClient,
  now = new Date(),
) {
  const { data, error } = await db
    .from("recordings")
    .select("id,user_id,storage_path")
    .eq("status", "ready")
    .not("storage_path", "is", null)
    .lte("delete_after", now.toISOString())
    .limit(500);
  if (error) throw new Error("recording_retention_query_failed");

  const summary = { due: data?.length ?? 0, deleted: 0, failed: 0 };
  for (const row of data ?? []) {
    if (!row.storage_path) continue;
    const { error: removeError } = await db.storage
      .from(RECORDINGS_BUCKET)
      .remove([row.storage_path]);
    if (removeError) {
      summary.failed += 1;
      continue;
    }
    const deletedAt = new Date().toISOString();
    const { error: updateError } = await db
      .from("recordings")
      .update({
        storage_path: null,
        audio_deleted_at: deletedAt,
        updated_at: deletedAt,
      })
      .eq("id", row.id)
      .eq("user_id", row.user_id)
      .eq("storage_path", row.storage_path);
    if (updateError) summary.failed += 1;
    else summary.deleted += 1;
  }
  return summary;
}
