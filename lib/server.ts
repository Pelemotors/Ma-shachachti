import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { AppState, StateSchema, emptyState } from "./model";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function fail(e: unknown) {
  if (e instanceof ApiError)
    return Response.json({ error: e.message }, { status: e.status });
  if (e instanceof Error && e.name === "ZodError")
    return Response.json({ error: "המידע שנשלח אינו תקין." }, { status: 400 });
  console.error("Request failed:", e instanceof Error ? e.name : "unknown");
  return Response.json(
    { error: "הפעולה לא הושלמה. אפשר לנסות שוב." },
    { status: 500 },
  );
}
export async function authorize(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new ApiError(503, "שמירה בענן עדיין לא מחוברת.");
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) throw new ApiError(401, "צריך להתחבר כדי להמשיך.");
  const db = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user)
    throw new ApiError(401, "ההתחברות הסתיימה. יש להתחבר שוב.");
  return { db, userId: data.user.id };
}
export async function readState(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from("app_states")
    .select("data,revision")
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) throw new ApiError(503, "לא ניתן לקרוא את המידע בענן.");
  const state = data ? StateSchema.parse(data.data) : emptyState();
  const { data: queue, error: queueError } = await db
    .from("reminder_queue")
    .select("id,status")
    .eq("owner_id", userId);
  if (queueError) throw new ApiError(503, "לא ניתן לקרוא את מצב התזכורות.");
  for (const reminder of state.reminders) {
    const q = queue?.find((q) => q.id === reminder.id);
    if (q) reminder.status = q.status;
  }
  return { state, revision: data?.revision ?? 0 };
}
export async function saveState(
  db: SupabaseClient,
  state: AppState,
  revision: number,
) {
  const parsed = StateSchema.parse(state);
  const { data, error } = await db.rpc("save_app_state", {
    p_data: parsed,
    p_expected_revision: revision,
  });
  if (error) {
    if (error.message.includes("revision_conflict"))
      throw new ApiError(
        409,
        "המידע השתנה בחלון אחר. טענו מחדש לפני ניסיון נוסף.",
      );
    throw new ApiError(503, "השמירה לא הצליחה. השינוי עדיין לא נשמר.");
  }
  return Number(data);
}
export function adminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new ApiError(503, "שירות הרקע עדיין לא הוגדר.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function budget(userId: string, kind: string, limit: number) {
  const db = adminDb();
  const { data, error } = await db.rpc("consume_ai_budget", {
    p_owner: userId,
    p_kind: kind,
    p_limit: limit,
  });
  if (error) throw new ApiError(503, "בקרת השימוש אינה זמינה.");
  if (!data)
    throw new ApiError(
      429,
      "הגענו למכסת הבקשות לשעה. אפשר להמשיך לנהל משימות ולנסות שוב בהמשך.",
    );
}
export async function jsonBody(req: Request, max = 1000000) {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > max) throw new ApiError(413, "הבקשה גדולה מדי.");
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, "חסר תוכן.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new ApiError(413, "הבקשה גדולה מדי.");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(all));
  } catch {
    throw new ApiError(400, "הבקשה אינה תקינה.");
  }
}
