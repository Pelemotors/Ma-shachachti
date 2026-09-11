import { authorize, HttpError } from "@/lib/server-auth";
import { recordingId, retryRecording } from "@/lib/recordings";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  req: Request,
  context: RouteContext<"/api/recordings/[id]/retry">,
) {
  try {
    const { db, userId } = await authorize(req);
    const { id: rawId } = await context.params;
    const recording = await retryRecording(db, userId, recordingId(rawId));
    return Response.json({ recording });
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("Recording retry failed");
    return Response.json(
      { error: "לא הצלחנו לנסות לתמלל שוב." },
      { status: 500 },
    );
  }
}
