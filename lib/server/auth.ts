import { createClient } from "@supabase/supabase-js";
import { ApiError } from "./errors";

export function adminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new ApiError(
      503,
      "שירות הרקע עדיין לא הוגדר.",
      "backend_not_configured",
    );
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function authorize(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new ApiError(
      503,
      "שמירה בענן עדיין לא מחוברת.",
      "cloud_not_configured",
    );
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token)
    throw new ApiError(401, "צריך להתחבר כדי להמשיך.", "auth_required");
  const db = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user)
    throw new ApiError(
      401,
      "ההתחברות הסתיימה. יש להתחבר שוב.",
      "session_expired",
    );
  const { data: role, error: roleError } = await db
    .from("user_roles")
    .select("approved")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (roleError || !role?.approved)
    throw new ApiError(
      403,
      "החשבון ממתין לאישור מנהל.",
      "account_not_approved",
    );
  return { db, userId: data.user.id };
}
