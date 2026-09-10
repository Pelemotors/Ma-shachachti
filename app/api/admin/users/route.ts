import { z } from "zod";
import { authorizeAdmin, HttpError } from "@/lib/server-auth";
import { adminJsonError } from "@/lib/admin-api";
import { recordActivity } from "@/lib/activity";
import { createServiceClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const Patch = z.object({
  userId: z.string().uuid(),
  role: z.enum(["user", "admin"]).optional(),
  approved: z.boolean().optional(),
  confirmEmail: z.boolean().optional(),
});

export async function GET(req: Request) {
  try {
    await authorizeAdmin(req);
    const admin = createServiceClient();
    const { data: roles, error: rolesError } = await admin
      .from("user_roles")
      .select("user_id,role,approved,created_at");
    if (rolesError) throw new HttpError(503, "לא הצלחנו לטעון משתמשים.");

    const users = [];
    const byId = new Map(
      (roles ?? []).map((row) => [row.user_id as string, row]),
    );
    let page = 1;
    while (page <= 10) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) throw new HttpError(503, "לא הצלחנו לטעון משתמשים.");
      for (const user of data.users) {
        const role = byId.get(user.id);
        users.push({
          id: user.id,
          email: user.email ?? "",
          emailConfirmed: Boolean(user.email_confirmed_at),
          createdAt: user.created_at,
          lastSignInAt: user.last_sign_in_at ?? null,
          role: (role?.role as "user" | "admin") ?? "user",
          approved: Boolean(role?.approved),
        });
      }
      if (data.users.length < 200) break;
      page += 1;
    }
    users.sort((a, b) => a.email.localeCompare(b.email, "he"));
    return Response.json({ users });
  } catch (error) {
    return adminJsonError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const { userId: adminId } = await authorizeAdmin(req);
    const body = Patch.parse(await req.json());
    const admin = createServiceClient();

    if (
      body.userId === adminId &&
      (body.approved === false || body.role === "user")
    ) {
      throw new HttpError(409, "אי אפשר לחסום או להסיר את עצמך.");
    }

    if (body.confirmEmail) {
      const { error } = await admin.auth.admin.updateUserById(body.userId, {
        email_confirm: true,
      });
      if (error) throw new HttpError(503, "אימות המייל לא הושלם.");
    }

    if (body.confirmEmail && body.role == null && body.approved == null) {
      const { data: current } = await admin
        .from("user_roles")
        .select("role,approved")
        .eq("user_id", body.userId)
        .maybeSingle();
      return Response.json({
        ok: true,
        user: {
          id: body.userId,
          role: (current?.role as "user" | "admin") ?? "user",
          approved: Boolean(current?.approved),
        },
      });
    }

    if (body.role != null || body.approved != null) {
      const { data: current } = await admin
        .from("user_roles")
        .select("role,approved")
        .eq("user_id", body.userId)
        .maybeSingle();
      const nextRole = body.role ?? (current?.role as "user" | "admin") ?? "user";
      const nextApproved = body.approved ?? Boolean(current?.approved);
      const { data, error } = await admin.rpc("admin_set_user_access", {
        p_user: body.userId,
        p_role: nextRole,
        p_approved: nextApproved,
      });
      if (error) {
        if (String(error.message).includes("last_admin")) {
          throw new HttpError(409, "חייב להישאר לפחות מנהל מאושר אחד.");
        }
        throw new HttpError(503, "לא הצלחנו לעדכן את ההרשאה.");
      }
      await recordActivity(admin, {
        ownerId: adminId,
        eventType: "admin.access.changed",
        metadata: {
          userId: body.userId,
          role: nextRole,
          approved: nextApproved,
        },
      });
      const row = Array.isArray(data) ? data[0] : data;
      return Response.json({
        ok: true,
        user: {
          id: body.userId,
          role: (row?.role as "user" | "admin") ?? nextRole,
          approved: Boolean(row?.approved ?? nextApproved),
        },
      });
    }

    return Response.json({
      ok: true,
      user: { id: body.userId, role: "user", approved: false },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "בקשת הניהול אינה תקינה." }, { status: 400 });
    }
    return adminJsonError(error);
  }
}
