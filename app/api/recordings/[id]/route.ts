import { authorize, HttpError } from "@/lib/server-auth";
import {
  correctRecordingTranscript,
  deleteRecording,
  recordingId,
} from "@/lib/recordings";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  context: RouteContext<"/api/recordings/[id]">,
) {
  try {
    const { db, userId } = await authorize(req);
    const { id: rawId } = await context.params;
    const id = recordingId(rawId);
    const body = (await req.json().catch(() => null)) as { transcript?: unknown } | null;
    if (typeof body?.transcript !== "string") {
      throw new HttpError(400, "חסר תמלול מתוקן.");
    }
    const recording = await correctRecordingTranscript(db, userId, id, body.transcript);
    return Response.json({ recording });
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("Recording correction failed");
    return Response.json({ error: "לא הצלחנו לשמור את התמלול המתוקן." }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  context: RouteContext<"/api/recordings/[id]">,
) {
  try {
    const { db, userId } = await authorize(req);
    const { id: rawId } = await context.params;
    const id = recordingId(rawId);
    const audioOnly = new URL(req.url).searchParams.get("audioOnly") === "true";
    await deleteRecording(db, userId, id, audioOnly);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("Recording delete failed");
    return Response.json(
      { error: "לא הצלחנו למחוק את ההקלטה." },
      { status: 500 },
    );
  }
}
