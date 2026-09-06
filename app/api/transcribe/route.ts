import { authorize, readState, budget, ApiError, fail } from "@/lib/server";
export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const { state } = await readState(db, userId);
    if (!state.profile.aiConsent)
      throw new ApiError(403, "נדרשת הסכמה לשימוש בשירות התמלול.");
    if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_TRANSCRIPTION_MODEL)
      throw new ApiError(503, "התמלול עדיין לא מחובר. אפשר להקליד.");
    if (Number(req.headers.get("content-length") ?? 0) > 10_500_000)
      throw new ApiError(413, "ההקלטה ארוכה מדי.");
    const blob = await req.blob();
    if (blob.size > 10_000_000) throw new ApiError(413, "ההקלטה ארוכה מדי.");
    const mime = blob.type.split(";")[0];
    if (!["audio/webm", "audio/mp4", "audio/ogg", "audio/wav"].includes(mime))
      throw new ApiError(400, "פורמט ההקלטה לא נתמך.");
    await budget(userId, "transcribe", 20);
    const form = new FormData();
    form.append(
      "file",
      blob,
      `recording.${mime === "audio/mp4" ? "mp4" : mime.split("/")[1]}`,
    );
    form.append("model", process.env.OPENAI_TRANSCRIPTION_MODEL);
    form.append("language", "he");
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok)
      throw new ApiError(502, "לא הצלחתי לתמלל. אפשר לנסות שוב או להקליד.");
    const data = await res.json();
    return Response.json({ text: String(data.text ?? "").slice(0, 6000) });
  } catch (e) {
    return fail(e);
  }
}
