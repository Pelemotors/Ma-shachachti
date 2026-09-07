import { createHash } from "node:crypto";
import { z } from "zod";
import {
  authorize,
  readState,
  budget,
  fail,
  ApiError,
  jsonBody,
  activity,
} from "@/lib/server";
import { orchestrateChatTurn } from "@/lib/agent/orchestration";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const started = Date.now();
  let ownerId: string | null = null;
  try {
    const { db, userId } = await authorize(req);
    ownerId = userId;
    const body = z
      .object({
        message: z.string().trim().min(1).max(6000),
        contextTaskId: z.string().uuid().nullable().optional(),
        idempotencyKey: z.string().uuid(),
        turnId: z.string().uuid().optional(),
      })
      .parse(await jsonBody(req, 20_000));
    const turnId = body.turnId ?? body.idempotencyKey;
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify({
          message: body.message,
          contextTaskId: body.contextTaskId ?? null,
          turnId,
        }),
      )
      .digest("hex");
    const { data: cached, error: cachedError } = await db
      .from("chat_receipts")
      .select("request_hash,response")
      .eq("owner_id", userId)
      .eq("idempotency_key", body.idempotencyKey)
      .maybeSingle();
    if (cachedError)
      throw new ApiError(
        503,
        "לא ניתן לבדוק ניסיון שיחה קודם. אפשר לנסות שוב בעוד רגע.",
        "chat_receipt_unavailable",
      );
    if (cached) {
      if (cached.request_hash !== requestHash)
        throw new ApiError(
          409,
          "מזהה ניסיון השיחה כבר שייך להודעה אחרת.",
          "chat_idempotency_conflict",
        );
      return Response.json(cached.response, {
        headers: { "Cache-Control": "no-store", "X-Idempotent-Replay": "1" },
      });
    }

    const { state, revision } = await readState(db, userId);
    await budget(userId, "chat", Number(process.env.AI_HOURLY_LIMIT) || 30);

    const result = await orchestrateChatTurn({
      state,
      revision,
      message: body.message,
      contextTaskId: body.contextTaskId ?? null,
      turnId,
      requestId,
    });

    const { selectedModel, ...payload } = result;

    const { error: receiptError } = await db.from("chat_receipts").upsert(
      {
        owner_id: userId,
        idempotency_key: body.idempotencyKey,
        request_hash: requestHash,
        response: payload,
      },
      { onConflict: "owner_id,idempotency_key", ignoreDuplicates: true },
    );
    if (receiptError) console.error("Chat receipt write failed", { requestId });

    await activity(userId, "ai.success", {
      requestId,
      turnId,
      latencyMs: Date.now() - started,
      model: selectedModel,
      actionCount: result.explicitActions.length,
      hasClarification: Boolean(result.clarification),
      hasProposal: Boolean(result.proposal),
      rejectedActionCount: result.rejectedActionCount,
    });
    return Response.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (ownerId)
      await activity(ownerId, "ai.failure", {
        requestId,
        latencyMs: Date.now() - started,
        code: e instanceof ApiError ? e.code : "internal_error",
        status: e instanceof ApiError ? e.status : 500,
      });
    return fail(e, requestId);
  }
}
