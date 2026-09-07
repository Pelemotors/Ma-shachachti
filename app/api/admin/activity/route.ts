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
    const url = new URL(req.url);
    const limit = Math.max(
      1,
      Math.min(200, Number(url.searchParams.get("limit")) || 100),
    );
    const before = url.searchParams.get("before");
    let query = db
      .from("activity_events")
      .select("id,event_type,created_at")
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    if (before) query = query.lt("created_at", before);
    const { data, error } = await query;
    if (error)
      throw new ApiError(
        503,
        "לא ניתן לקרוא פעילות.",
        "admin_activity_read_failed",
      );
    const rows = data ?? [];
    return Response.json({
      events: rows.slice(0, limit),
      nextBefore:
        rows.length > limit ? (rows[limit - 1]?.created_at ?? null) : null,
    });
  } catch (e) {
    return fail(e);
  }
}
