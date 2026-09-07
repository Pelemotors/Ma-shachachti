import { adminDb } from "./auth";
import { ApiError } from "./errors";

export async function budget(userId: string, kind: string, limit: number) {
  const db = adminDb();
  const { data, error } = await db.rpc("consume_ai_budget", {
    p_owner: userId,
    p_kind: kind,
    p_limit: limit,
  });
  if (error)
    throw new ApiError(503, "בקרת השימוש אינה זמינה.", "budget_unavailable");
  if (!data)
    throw new ApiError(
      429,
      "הגענו למכסת הבקשות לשעה. אפשר להמשיך לנהל משימות ולנסות שוב בהמשך.",
      "hourly_limit",
    );
}
