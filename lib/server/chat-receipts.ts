import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "./errors";

export type ClaimOutcome =
  | { outcome: "claimed" }
  | { outcome: "replay"; response: unknown }
  | { outcome: "in_progress" }
  | { outcome: "conflict" };

export async function claimChatReceipt(
  db: SupabaseClient,
  input: { userId: string; idempotencyKey: string; requestHash: string },
): Promise<ClaimOutcome> {
  const { data, error } = await db.rpc("claim_chat_receipt", {
    p_owner: input.userId,
    p_key: input.idempotencyKey,
    p_hash: input.requestHash,
  });
  if (error) {
    // Fallback for DBs that have not applied the EXPAND migration yet.
    const { data: cached, error: cachedError } = await db
      .from("chat_receipts")
      .select("request_hash,response,status")
      .eq("owner_id", input.userId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (cachedError)
      throw new ApiError(
        503,
        "לא ניתן לבדוק ניסיון שיחה קודם. אפשר לנסות שוב בעוד רגע.",
        "chat_receipt_unavailable",
      );
    if (cached) {
      if (cached.request_hash !== input.requestHash)
        return { outcome: "conflict" };
      if ((cached as { status?: string }).status === "pending")
        return { outcome: "in_progress" };
      return { outcome: "replay", response: cached.response };
    }
    const { error: insertError } = await db.from("chat_receipts").insert({
      owner_id: input.userId,
      idempotency_key: input.idempotencyKey,
      request_hash: input.requestHash,
      response: {},
      status: "pending",
    });
    if (insertError) {
      // Concurrent claim — re-read
      const { data: again } = await db
        .from("chat_receipts")
        .select("request_hash,response,status")
        .eq("owner_id", input.userId)
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
      if (again?.request_hash !== input.requestHash)
        return { outcome: "conflict" };
      if ((again as { status?: string } | null)?.status === "completed")
        return { outcome: "replay", response: again!.response };
      return { outcome: "in_progress" };
    }
    return { outcome: "claimed" };
  }

  const row = data as ClaimOutcome;
  if (!row?.outcome)
    throw new ApiError(503, "תשובת claim לא תקינה.", "chat_claim_invalid");
  return row;
}

export async function completeChatReceipt(
  db: SupabaseClient,
  input: {
    userId: string;
    idempotencyKey: string;
    requestHash: string;
    response: unknown;
    status?: "completed" | "failed";
  },
) {
  const status = input.status ?? "completed";
  const { data, error } = await db.rpc("complete_chat_receipt", {
    p_owner: input.userId,
    p_key: input.idempotencyKey,
    p_hash: input.requestHash,
    p_response: input.response,
    p_status: status,
  });
  if (!error && data && (data as { ok?: boolean }).ok) return;

  const { error: upsertError } = await db.from("chat_receipts").upsert(
    {
      owner_id: input.userId,
      idempotency_key: input.idempotencyKey,
      request_hash: input.requestHash,
      response: input.response,
      status,
    },
    { onConflict: "owner_id,idempotency_key" },
  );
  if (upsertError)
    throw new ApiError(
      503,
      "השיחה עובדה אך שמירת האישור נכשלה. אפשר לנסות שוב באותו מפתח.",
      "chat_receipt_write_failed",
    );
}
