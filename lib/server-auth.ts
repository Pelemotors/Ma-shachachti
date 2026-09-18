import { createClient } from "@supabase/supabase-js";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function authorizeIdentity(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new HttpError(503, "החיבור לענן עדיין לא הוגדר.");

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "צריך להתחבר כדי להמשיך.");

  const db = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user)
    throw new HttpError(401, "ההתחברות הסתיימה. יש להתחבר שוב.");

  return { db, userId: data.user.id };
}

export async function authorize(req: Request) {
  const identity = await authorizeIdentity(req);
  const { data: access, error: accessError } = await identity.db
    .from("user_roles")
    .select("approved")
    .eq("user_id", identity.userId)
    .maybeSingle();

  if (accessError) throw new HttpError(503, "לא הצלחנו לבדוק את הרשאת החשבון.");
  if (!access?.approved) throw new HttpError(403, "החשבון עדיין ממתין לאישור.");

  return identity;
}

export async function authorizeAdmin(req: Request) {
  const auth = await authorize(req);
  const { data, error } = await auth.db
    .from("user_roles")
    .select("role,approved")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (error) throw new HttpError(503, "לא הצלחנו לבדוק את הרשאת המנהל.");
  if (data?.role !== "admin" || data.approved !== true) {
    throw new HttpError(403, "אין הרשאת מנהל.");
  }
  return auth;
}
