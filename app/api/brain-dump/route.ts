import { authorize, HttpError } from "@/lib/server-auth";
import { recordingId } from "@/lib/recordings";
import { processBrainDumpTranscript } from "@/lib/agent/brain-dump";
import { AgentUpstreamError } from "@/lib/agent/openai-orchestrator";

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

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new HttpError(503, "חיבור ה-AI עדיין לא הוגדר.");

    const result = await processBrainDumpTranscript({
      db,
      userId,
      recordingId: id,
      transcript: transcript || String(recording.transcript ?? ""),
      apiKey,
    });

    // Intentionally no chat reply / no chat messages.
    return Response.json(result);
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
