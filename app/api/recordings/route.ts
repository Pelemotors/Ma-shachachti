import { authorize, HttpError } from "@/lib/server-auth";
import {
  RECORDING_SELECT,
  recordingDuration,
  recordingId,
  resumeRecordingWithBlob,
  uploadClaimedRecording,
  type RecordingRow,
} from "@/lib/recordings";
import { inspectAudioBlob } from "@/lib/audio/transcription-service";

export const runtime = "nodejs";
export const maxDuration = 60;

function fail(error: unknown, id?: string) {
  if (error instanceof HttpError) {
    return Response.json(
      { error: error.message, recording_id: id },
      { status: error.status },
    );
  }
  console.error("Recording processing failed", { recording_id: id });
  return Response.json(
    { error: "לא הצלחנו לעבד את ההקלטה.", recording_id: id },
    { status: 500 },
  );
}

export async function GET(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const { data, error } = await db
      .from("recordings")
      .select(RECORDING_SELECT)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new HttpError(503, "לא הצלחנו לטעון את ההקלטות.");
    return Response.json({
      recordings: (data ?? []).map(({ processing_token: _token, ...row }) => row),
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  let id: string | undefined;
  try {
    const { db, userId } = await authorize(req);
    id = recordingId(req.headers.get("x-recording-id"));
    const duration = recordingDuration(req.headers.get("x-recording-duration"));
    const blob = await req.blob();
    const inspected = inspectAudioBlob(
      blob,
      Number(req.headers.get("content-length") ?? blob.size),
    );

    const { data: existing, error: lookupError } = await db
      .from("recordings")
      .select(RECORDING_SELECT)
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();
    if (lookupError) throw new HttpError(503, "לא הצלחנו לבדוק את ההקלטה.");
    if (existing) {
      return Response.json({
        recording: await resumeRecordingWithBlob(
          db,
          userId,
          existing as RecordingRow,
          blob,
          duration,
        ),
      });
    }

    const token = crypto.randomUUID();
    const now = new Date().toISOString();
    const { error: insertError } = await db.from("recordings").insert({
      id,
      user_id: userId,
      status: "uploading",
      storage_path: null,
      mime: inspected.mime,
      size: blob.size,
      duration_seconds: duration,
      transcript: null,
      error_code: null,
      error_message: null,
      created_at: now,
      updated_at: now,
      processed_at: null,
      delete_after: null,
      audio_deleted_at: null,
      processing_token: token,
    });
    if (insertError) {
      // A concurrent identical POST may have won the primary-key claim.
      const { data: raced, error: raceError } = await db
        .from("recordings")
        .select(RECORDING_SELECT)
        .eq("user_id", userId)
        .eq("id", id)
        .maybeSingle();
      if (raceError || !raced) {
        throw new HttpError(503, "לא הצלחנו לשמור את ההקלטה.");
      }
      return Response.json({
        recording: await resumeRecordingWithBlob(
          db,
          userId,
          raced as RecordingRow,
          blob,
          duration,
        ),
      });
    }

    return Response.json(
      {
        recording: await uploadClaimedRecording(
          db,
          userId,
          id,
          token,
          blob,
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return fail(error, id);
  }
}
