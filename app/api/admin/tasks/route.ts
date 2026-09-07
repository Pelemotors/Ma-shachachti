import { adminDb, ApiError, authorize, fail } from "@/lib/server";

async function admin(req: Request) {
  const { userId } = await authorize(req);
  const db = adminDb();
  const { data } = await db
    .from("user_roles")
    .select("role,approved")
    .eq("user_id", userId)
    .maybeSingle();
  if (data?.role !== "admin" || !data.approved)
    throw new ApiError(403, "אין הרשאת מנהל.", "admin_required");
  return db;
}

export async function GET(req: Request) {
  try {
    const db = await admin(req);
    const { data, error } = await db.from("app_states").select("data");
    if (error)
      throw new ApiError(
        503,
        "לא ניתן לקרוא נתוני משימות.",
        "admin_tasks_read_failed",
      );
    const byStatus: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    let total = 0;
    for (const row of data ?? []) {
      const tasks = Array.isArray(row.data?.tasks) ? row.data.tasks : [];
      for (const task of tasks) {
        total++;
        const status = String(task?.status ?? "unknown");
        const category = String(
          task?.categoryId ?? task?.category ?? "unclassified",
        );
        byStatus[status] = (byStatus[status] ?? 0) + 1;
        byCategory[category] = (byCategory[category] ?? 0) + 1;
      }
    }
    return Response.json({ total, byStatus, byCategory });
  } catch (e) {
    return fail(e);
  }
}
