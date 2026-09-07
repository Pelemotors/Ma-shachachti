import { z } from "zod";
import { authorize, fail, ApiError, jsonBody, budget } from "@/lib/server";
import { analyzeFirstScanSemantic } from "@/lib/domain/first-scan/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  let ownerId: string | null = null;
  try {
    const { userId } = await authorize(req);
    ownerId = userId;
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
    return fail(error, { requestId, ownerId, route: "first-scan/analyze" });
  }
}
