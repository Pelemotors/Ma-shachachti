import { z } from "zod";
import {
  authorize,
  fail,
  jsonBody,
  budget,
  readState,
  ApiError,
} from "@/lib/server";
import {
  analyzeFirstScanSemantic,
  ScanAnalysisError,
} from "@/lib/domain/first-scan/ai";
import { messageForCode } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { db, userId } = await authorize(req);
    const { state } = await readState(db, userId);
    if (!state.profile.aiConsent)
      throw new ApiError(
        403,
        messageForCode("ai_consent_required"),
        "ai_consent_required",
      );
    const body = z
      .object({ text: z.string().trim().min(1).max(8000) })
      .parse(await jsonBody(req, 20_000));
    await budget(userId, "chat", Number(process.env.AI_HOURLY_LIMIT) || 30);
    const { analysis, source } = await analyzeFirstScanSemantic(body.text);
    return Response.json(
      { analysis, source },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ScanAnalysisError) {
      const status = error.code === "ai_not_configured" ? 503 : 502;
      return fail(
        new ApiError(status, messageForCode(error.code), error.code),
        requestId,
      );
    }
    return fail(error, requestId);
  }
}
