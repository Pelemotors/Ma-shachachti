import { authorize, HttpError } from "@/lib/server-auth";
import { recordingId } from "@/lib/recordings";
import { AgentUpstreamError } from "@/lib/agent/openai-orchestrator";
import { enqueueJob, processQueuedJobs } from "@/lib/jobs";
import { createServiceClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const body = (await req.json().catch(() => null)) as {
      recording_id?: unknown;
      transcript?: unknown;
    } | null;
    const id = recordingId(
      typeof body?.recording_id === "string" ? body.recording_id : null,
    );
    const transcript =
      typeof body?.transcript === "string" ? body.transcript.trim() : "";
    if (!transcript) {
      throw new HttpError(400, "חסר תמלול לעיבוד.");
    }

    const { data: recording, error } = await db
      .from("recordings")
      .select("id,status,transcript")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new HttpError(503, "לא הצלחנו לטעון את ההקלטה.");
    if (!recording) throw new HttpError(404, "ההקלטה לא נמצאה.");
    if (recording.status !== "ready") {
      throw new HttpError(409, "ההקלטה עדיין לא מוכנה לעיבוד.");
    }

    const job = await enqueueJob(db, userId, {
      job_type: "brain_dump",
      idempotency_key: `brain-dump:${id}`,
      recording_id: id,
    });
    void processQueuedJobs(createServiceClient()).catch(() => null);
    return Response.json({ job, recording_id: id, queued: true });
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof AgentUpstreamError) {
      return Response.json(
        { error: "לא הצלחנו לעבד את ה־Brain Dump כרגע." },
        { status: error.status === 429 ? 503 : 502 },
      );
    }
    console.error("Brain dump processing failed");
    return Response.json(
      { error: "לא הצלחנו לעבד את ההקלטה." },
      { status: 500 },
    );
  }
}
