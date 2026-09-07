import { createHash } from "node:crypto";
import {
  authorize,
  readState,
  fail,
  jsonBody,
  ApiError,
  activity,
} from "@/lib/server";
import { ActionBatch, StateSchema } from "@/lib/model";
import { applyActions } from "@/lib/engine";
import { z } from "zod";

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { db, userId } = await authorize(req);
    const body = z
      .object({
        actions: ActionBatch,
        revision: z.number().int().min(0),
        confirmed: z.boolean().default(false),
        idempotencyKey: z.string().uuid().optional(),
      })
      .parse(await jsonBody(req));
    const key = body.idempotencyKey ?? crypto.randomUUID();
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify({
          actions: body.actions,
          revision: body.revision,
          confirmed: body.confirmed,
        }),
      )
      .digest("hex");

    if (body.idempotencyKey) {
      const { data: cached, error: cachedError } = await db
        .from("action_receipts")
        .select("request_hash,response")
        .eq("owner_id", userId)
        .eq("idempotency_key", key)
        .maybeSingle();
      if (cachedError)
        throw new ApiError(
          503,
          "לא ניתן לבדוק ניסיון שמירה קודם. אפשר לנסות שוב בעוד רגע.",
          "action_receipt_unavailable",
        );
      if (cached) {
        if (cached.request_hash && cached.request_hash !== requestHash)
          throw new ApiError(
            409,
            "מזהה ניסיון השמירה כבר שייך לפעולה אחרת.",
            "action_idempotency_conflict",
          );
        return Response.json(cached.response, {
          headers: {
            "Cache-Control": "no-store",
            "X-Idempotent-Replay": "1",
          },
        });
      }
    }

    const current = await readState(db, userId);
    let proposed;
    try {
      proposed = applyActions(
        current.state,
        body.actions,
        new Date(),
        body.confirmed,
      );
    } catch (e) {
      throw new ApiError(
        400,
        e instanceof Error ? e.message : "הפעולה לא תקינה.",
        "invalid_action",
      );
    }

    const { data, error } = await db.rpc("idempotent_save_app_state", {
      p_data: StateSchema.parse(proposed),
      p_expected_revision: body.revision,
      p_key: key,
      p_request_hash: requestHash,
    });
    if (error) {
      if (error.message.includes("idempotency_conflict"))
        throw new ApiError(
          409,
          "מזהה ניסיון השמירה כבר שייך לפעולה אחרת.",
          "action_idempotency_conflict",
        );
      if (error.message.includes("revision_conflict"))
        throw new ApiError(
          409,
          "המידע השתנה בחלון אחר. טענו מחדש לפני ניסיון נוסף.",
          "revision_conflict",
        );
      throw new ApiError(
        503,
        "השמירה לא הצליחה. השינוי עדיין לא נשמר.",
        "state_save_failed",
      );
    }

    const state = StateSchema.parse(data.state);
    const revision = Number(data.revision);
    await activity(userId, "actions.saved", {
      requestId,
      actionCount: body.actions.length,
      revision,
    });
    return Response.json(
      { state, revision, requestId },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e, requestId);
  }
}
