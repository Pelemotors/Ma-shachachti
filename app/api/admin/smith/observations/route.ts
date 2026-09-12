import { adminJsonError } from "@/lib/admin-api";
import { createServiceClient } from "@/lib/supabase-admin";
import { authorizeAdmin, HttpError } from "@/lib/server-auth";
import { smithControlEnabled } from "@/lib/smith/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await authorizeAdmin(req);
    if (!smithControlEnabled()) {
      return Response.json(
        { observations: [], enabled: false, nextCursor: null },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const url = new URL(req.url);
    const limit = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get("limit")) || 30),
    );
    const before = url.searchParams.get("before");
    let query = createServiceClient()
      .schema("smith_control")
      .from("smith_observations")
      .select(
        "id,work_item_id,event_name,source,environment,severity,title,summary,evidence,metrics,observed_at",
      )
      .order("observed_at", { ascending: false })
      .limit(limit);
    if (before) query = query.lt("observed_at", before);
    const { data, error } = await query;
    if (error) throw new HttpError(503, "Smith observations אינם זמינים.");

    return Response.json({
      enabled: true,
      observations: data ?? [],
      nextCursor:
        data?.length === limit ? (data.at(-1)?.observed_at ?? null) : null,
    });
  } catch (error) {
    return adminJsonError(error);
  }
}
