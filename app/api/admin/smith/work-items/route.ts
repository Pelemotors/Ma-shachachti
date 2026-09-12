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
        { items: [], enabled: false, nextCursor: null },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const url = new URL(req.url);
    const limit = Math.min(
      50,
      Math.max(1, Number(url.searchParams.get("limit")) || 20),
    );
    const before = url.searchParams.get("before");
    let query = createServiceClient()
      .schema("smith_control")
      .from("smith_work_items")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (before) query = query.lt("updated_at", before);
    const { data, error } = await query;
    if (error) throw new HttpError(503, "Smith Control Plane אינו זמין.");

    return Response.json({
      enabled: true,
      items: data ?? [],
      nextCursor:
        data?.length === limit ? (data.at(-1)?.updated_at ?? null) : null,
    });
  } catch (error) {
    return adminJsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await authorizeAdmin(req);
    if (!smithControlEnabled()) {
      throw new HttpError(503, "Smith Control Plane עדיין לא הוגדר.");
    }
    const body = await req.json().catch(() => null);
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const description =
      typeof body?.description === "string" ? body.description.trim() : "";
    const risk = ["low", "medium", "high"].includes(body?.riskLevel)
      ? body.riskLevel
      : "medium";
    if (!title || title.length > 200) {
      throw new HttpError(400, "נדרשת כותרת תקינה.");
    }

    const db = createServiceClient().schema("smith_control");
    const { data, error } = await db
      .from("smith_work_items")
      .insert({
        title,
        description,
        source: "admin",
        risk_level: risk,
        created_by: admin.userId,
      })
      .select("*")
      .single();
    if (error) throw new HttpError(503, "יצירת Work Item נכשלה.");

    await db.from("smith_audit_log").insert({
      action: "work_item.created",
      actor_type: "admin",
      actor_id: admin.userId,
      environment: "local",
      target_type: "work_item",
      target_id: data.id,
      work_item_id: data.id,
      status: "completed",
      metadata: {},
    });

    return Response.json({ item: data }, { status: 201 });
  } catch (error) {
    return adminJsonError(error);
  }
}
