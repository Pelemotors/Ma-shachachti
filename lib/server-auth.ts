import { createClient } from "@supabase/supabase-js";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function authorize(req: Request) {
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

  const { data: access, error: accessError } = await db
    .from("user_roles")
    .select("approved")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (accessError) throw new HttpError(503, "לא הצלחנו לבדוק את הרשאת החשבון.");
  if (!access?.approved) throw new HttpError(403, "החשבון עדיין ממתין לאישור.");

  return { db, userId: data.user.id };
}
