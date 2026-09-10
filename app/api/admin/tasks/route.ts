import { authorizeAdmin, HttpError } from "@/lib/server-auth";
import { adminJsonError } from "@/lib/admin-api";
import { createServiceClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await authorizeAdmin(req);
    const admin = createServiceClient();
    const { data, error } = await admin.from("tasks").select("status");
    if (error) throw new HttpError(503, "לא הצלחנו לטעון משימות.");
    const rows = data ?? [];
    const byStatus: Record<string, number> = {};
    for (const row of rows) {
      const status = String(row.status ?? "unknown");
      byStatus[status] = (byStatus[status] ?? 0) + 1;
    }
    return Response.json({
      total: rows.length,
      byStatus,
      byCategory: {},
    });
  } catch (error) {
    return adminJsonError(error);
  }
}
