import { z } from "zod";
import { authorize, HttpError } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const { data, error } = await db
      .from("app_notifications")
      .select("id,kind,title,body,route,created_at,opened_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new HttpError(503, "לא הצלחנו לטעון התראות.");
    return Response.json({ notifications: data ?? [] });
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "לא הצלחנו לטעון התראות." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const body = z.object({ id: z.string().uuid() }).parse(await req.json());
    const { error } = await db
      .from("app_notifications")
      .update({ opened_at: new Date().toISOString() })
      .eq("id", body.id)
      .eq("user_id", userId);
    if (error) throw new HttpError(503, "לא הצלחנו לעדכן התראה.");
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "לא הצלחנו לעדכן התראה." }, { status: 400 });
  }
}
