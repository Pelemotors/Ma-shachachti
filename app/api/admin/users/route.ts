import { adminDb, ApiError, authorize, fail } from "@/lib/server";

async function requireAdmin(req: Request) {
  const { userId } = await authorize(req);
  const db = adminDb();
  const { data, error } = await db.from("user_roles").select("role,approved").eq("user_id", userId).maybeSingle();
  if (error || !data || data.role !== "admin" || !data.approved) throw new ApiError(403, "אין הרשאת מנהל.");
  return db;
}

export async function GET(req: Request) {
  try {
    const db = await requireAdmin(req);
    const { data: authData, error } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw new ApiError(503, "לא ניתן לקרוא משתמשים.");
    const { data: roles } = await db.from("user_roles").select("user_id,role,approved");
    const roleMap = new Map((roles ?? []).map((r) => [r.user_id, r]));
    return Response.json({ users: authData.users.map((u) => ({ id: u.id, email: u.email, emailConfirmed: !!u.email_confirmed_at, createdAt: u.created_at, role: roleMap.get(u.id)?.role ?? "user", approved: roleMap.get(u.id)?.approved ?? false })) });
  } catch (e) { return fail(e); }
}

export async function PATCH(req: Request) {
  try {
    const db = await requireAdmin(req);
    const body = await req.json();
    if (!body?.userId) throw new ApiError(400, "חסר משתמש.");
    if (body.confirmEmail) {
      const { error } = await db.auth.admin.updateUserById(body.userId, { email_confirm: true });
      if (error) throw new ApiError(503, "אישור האימייל נכשל.");
    }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.approved === "boolean") patch.approved = body.approved;
    if (body.role === "admin" || body.role === "user") patch.role = body.role;
    const { error } = await db.from("user_roles").upsert({ user_id: body.userId, role: patch.role ?? "user", approved: patch.approved ?? false, updated_at: patch.updated_at }, { onConflict: "user_id" });
    if (error) throw new ApiError(503, "עדכון המשתמש נכשל.");
    return Response.json({ ok: true });
  } catch (e) { return fail(e); }
}
