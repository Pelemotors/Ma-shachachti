import { adminDb, ApiError, authorize, fail, activity } from "@/lib/server";

async function requireAdmin(req: Request) {
  const { userId } = await authorize(req);
  const db = adminDb();
  const { data, error } = await db
    .from("user_roles")
    .select("role,approved")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data || data.role !== "admin" || !data.approved)
    throw new ApiError(403, "אין הרשאת מנהל.", "admin_required");
  return { db, userId };
}

export async function GET(req: Request) {
  try {
    const { db } = await requireAdmin(req);
    const users = [];
    for (let page = 1; page <= 50; page++) {
      const { data, error } = await db.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error)
        throw new ApiError(
          503,
          "לא ניתן לקרוא משתמשים.",
          "admin_users_read_failed",
        );
      users.push(...data.users);
      if (data.users.length < 200) break;
    }
    const { data: roles, error: rolesError } = await db
      .from("user_roles")
      .select("user_id,role,approved");
    if (rolesError)
      throw new ApiError(
        503,
        "לא ניתן לקרוא הרשאות משתמשים.",
        "admin_roles_read_failed",
      );
    const roleMap = new Map((roles ?? []).map((r) => [r.user_id, r]));
    return Response.json({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        emailConfirmed: !!u.email_confirmed_at,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at,
        role: roleMap.get(u.id)?.role ?? "user",
        approved: roleMap.get(u.id)?.approved ?? false,
      })),
    });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const { db, userId: actorId } = await requireAdmin(req);
    const body = await req.json();
    if (!body?.userId)
      throw new ApiError(400, "חסר משתמש.", "admin_user_required");

    const { data: current, error: currentError } = await db
      .from("user_roles")
      .select("role,approved")
      .eq("user_id", body.userId)
      .maybeSingle();
    if (currentError)
      throw new ApiError(
        503,
        "לא ניתן לקרוא את הרשאות המשתמש.",
        "admin_role_read_failed",
      );
    const role =
      body.role === "admin" || body.role === "user"
        ? body.role
        : (current?.role ?? "user");
    const approved =
      typeof body.approved === "boolean"
        ? body.approved
        : (current?.approved ?? false);

    if (
      body.userId === actorId &&
      current?.role === "admin" &&
      current.approved &&
      (role !== "admin" || !approved)
    )
      throw new ApiError(
        409,
        "אי אפשר להסיר מעצמך הרשאת ניהול או לחסום את חשבון המנהל הפעיל.",
        "admin_self_lockout",
      );

    if (body.confirmEmail) {
      const { error } = await db.auth.admin.updateUserById(body.userId, {
        email_confirm: true,
      });
      if (error)
        throw new ApiError(503, "אישור האימייל נכשל.", "email_confirm_failed");
    }

    const { data, error } = await db.rpc("admin_set_user_access", {
      p_user: body.userId,
      p_role: role,
      p_approved: approved,
    });
    if (error) {
      if (error.message.includes("last_admin"))
        throw new ApiError(
          409,
          "חייב להישאר לפחות מנהל מאושר אחד.",
          "last_admin",
        );
      throw new ApiError(503, "עדכון המשתמש נכשל.", "admin_update_failed");
    }

    await activity(body.userId, "admin.access.changed", {
      role: data.role,
      approved: data.approved,
      emailConfirmed: Boolean(body.confirmEmail),
    });
    return Response.json({
      ok: true,
      user: { id: body.userId, role: data.role, approved: data.approved },
    });
  } catch (e) {
    return fail(e);
  }
}
