import { authorize, HttpError } from "@/lib/server-auth";
import {
  inspectTranscriptionAudio,
  transcriptionModelFromEnv,
} from "@/lib/audio/recorder-helpers";

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
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    const model = transcriptionModelFromEnv();
    if (!apiKey || !model) {
      throw new HttpError(503, "תמלול קולי עדיין לא הוגדר.");
    }

    const blob = await req.blob();
    const inspected = inspectTranscriptionAudio({
      contentLength: Number(req.headers.get("content-length") ?? 0),
      size: blob.size,
      mime: blob.type,
    });
    if (!inspected.ok) {
      throw new HttpError(inspected.status, inspected.error);
    }

    const form = new FormData();
    form.append("file", blob, inspected.filename);
    form.append("model", model);
    form.append("language", "he");

    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(45_000),
      },
    );
    if (!response.ok) {
      console.error("OpenAI transcription upstream error", {
        status: response.status,
      });
      throw new HttpError(502, "לא הצלחנו לתמלל. אפשר לנסות שוב.");
    }
    const data = (await response.json()) as { text?: unknown };
    return Response.json({
      text: String(data.text ?? "")
        .trim()
        .slice(0, 6000),
    });
  } catch (error) {
    return jsonError(error);
  }
}
