import { authorizeAdmin, HttpError } from "@/lib/server-auth";
import { adminJsonError } from "@/lib/admin-api";
import { createServiceClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await authorizeAdmin(req);
    const url = new URL(req.url);
    const limit = Math.min(
      200,
      Math.max(1, Number(url.searchParams.get("limit") ?? 100) || 100),
    );
    const before = url.searchParams.get("before");
    const admin = createServiceClient();
    let query = admin
      .from("activity_events")
      .select("id,event_type,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (before) query = query.lt("created_at", before);
    const { data, error } = await query;
    if (error) throw new HttpError(503, "לא הצלחנו לטעון פעילות.");
    const events = data ?? [];
    return Response.json({
      events,
      nextBefore: events.length === limit ? events[events.length - 1]?.created_at : null,
    });
  } catch (error) {
    return adminJsonError(error);
  }
}
