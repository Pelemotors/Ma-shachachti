import { adminDb, ApiError, authorize, fail } from "@/lib/server";

async function requireAdmin(req: Request) {
  const { userId } = await authorize(req);
  const db = adminDb();
  const { data, error } = await db.from("user_roles").select("role,approved").eq("user_id", userId).maybeSingle();
  if (error || !data || data.role !== "admin" || !data.approved) throw new ApiError(403, "אין הרשאת מנהל.");
  return {db,userId};
}

export async function GET(req: Request) {
  try {
    const {db} = await requireAdmin(req);
    const { data: authData, error } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw new ApiError(503, "לא ניתן לקרוא משתמשים.");
    const { data: roles } = await db.from("user_roles").select("user_id,role,approved");
    const roleMap = new Map((roles ?? []).map((r) => [r.user_id, r]));
    return Response.json({ users: authData.users.map((u) => ({ id: u.id, email: u.email, emailConfirmed: !!u.email_confirmed_at, createdAt: u.created_at, lastSignInAt: u.last_sign_in_at, role: roleMap.get(u.id)?.role ?? "user", approved: roleMap.get(u.id)?.approved ?? false })) });
  } catch (e) { return fail(e); }
}

export async function PATCH(req: Request) {
  try {
    const {db,userId:actorId} = await requireAdmin(req);
    const body = await req.json();
    if (!body?.userId) throw new ApiError(400, "חסר משתמש.");
    const { data: current, error: currentError } = await db.from("user_roles").select("role,approved").eq("user_id", body.userId).maybeSingle();
    if (currentError) throw new ApiError(503, "לא ניתן לקרוא את הרשאות המשתמש.");
    const role = body.role === "admin" || body.role === "user" ? body.role : current?.role ?? "user";
    const approved = typeof body.approved === "boolean" ? body.approved : current?.approved ?? false;
    const removesAdminAccess=current?.role==="admin"&&current.approved&&(role!=="admin"||!approved);
    if(removesAdminAccess){
      if(body.userId===actorId)throw new ApiError(409,"אי אפשר להסיר מעצמך הרשאת ניהול או לחסום את חשבון המנהל הפעיל.");
      const {count,error:countError}=await db.from("user_roles").select("user_id",{count:"exact",head:true}).eq("role","admin").eq("approved",true);
      if(countError)throw new ApiError(503,"לא ניתן לוודא הרשאות מנהל.");
      if((count??0)<=1)throw new ApiError(409,"חייב להישאר לפחות מנהל מאושר אחד.");
    }
    if (body.confirmEmail) {
      const { error } = await db.auth.admin.updateUserById(body.userId, { email_confirm: true });
      if (error) throw new ApiError(503, "אישור האימייל נכשל.");
    }
    const { error } = await db.from("user_roles").upsert({ user_id: body.userId, role, approved, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) throw new ApiError(503, "עדכון המשתמש נכשל.");
    return Response.json({ ok: true, user:{id:body.userId,role,approved} });
  } catch (e) { return fail(e); }
}
