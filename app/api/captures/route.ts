import { z } from "zod";
import { authorize, HttpError } from "@/lib/server-auth";
import { interpretCapture } from "@/lib/capture/ingest";
import { envFlag } from "@/lib/auth/identity";
import { logMobileEvent } from "@/lib/observability";

export const runtime = "nodejs";

const Body = z.object({
  kind: z.enum(["typed", "bank_mic", "share", "quick", "chat"]),
  text: z.string().max(8000).optional().nullable(),
  url: z.string().url().max(2000).optional().nullable(),
  imageCount: z.number().int().min(0).max(20).optional(),
  transcript: z.string().max(20000).optional().nullable(),
  recordingId: z.string().uuid().optional().nullable(),
  mutationId: z.string().uuid(),
});

export async function POST(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    if (!envFlag("SHARE_CAPTURE_ENABLED", true)) {
      throw new HttpError(403, "קליטת שיתוף כבויה.");
    }
    const body = Body.parse(await req.json());
    const intent = interpretCapture(body);
    logMobileEvent("CAPTURE_PROCESSED", { kind: body.kind });
    if (intent.type === "brain_dump" && intent.recordingId) {
      return Response.json({
        ok: true,
        intent,
        next: { action: "brain_dump", recording_id: intent.recordingId },
      });
    }
    if (intent.type === "chat_message") {
      return Response.json({
        ok: true,
        intent,
        next: { action: "chat", text: intent.text },
      });
    }
    const content = (
      intent.type === "link"
        ? `קישור משותף: ${intent.url}`
        : intent.type === "images"
          ? `שותפו ${intent.count} תמונות`
          : intent.type === "note"
            ? intent.text || "פריט משותף"
            : "פריט משותף"
    ).slice(0, 500);
    await db.from("agent_memory").insert({
      user_id: userId,
      kind: "fact",
      content,
      confidence: "medium",
      source: "user",
    });
    return Response.json({ ok: true, intent, next: { action: "stored" } });
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      return Response.json({ error: "קלט השיתוף אינו תקין." }, { status: 400 });
    }
    return Response.json({ error: "עיבוד השיתוף נכשל." }, { status: 500 });
  }
}
