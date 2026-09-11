import { authorize, HttpError } from "@/lib/server-auth";
import {
  inspectAudioBlob,
  transcribeAudio,
} from "@/lib/audio/transcription-service";

export const runtime = "nodejs";
export const maxDuration = 60;

function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("Lean transcribe error");
  return Response.json(
    { error: "לא הצלחנו לתמלל. אפשר לנסות שוב." },
    { status: 500 },
  );
}

export async function POST(req: Request) {
  try {
    await authorize(req);
    const blob = await req.blob();
    const inspected = inspectAudioBlob(
      blob,
      Number(req.headers.get("content-length") ?? 0),
    );
    return Response.json({ text: await transcribeAudio(blob, inspected) });
  } catch (error) {
    return jsonError(error);
  }
}
