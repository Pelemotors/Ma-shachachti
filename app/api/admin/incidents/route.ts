import { adminJsonError } from "@/lib/admin-api";
import { loadAdminIncidents } from "@/lib/admin-incidents";
import { authorizeAdmin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await authorizeAdmin(req);
    return Response.json(await loadAdminIncidents(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return adminJsonError(error);
  }
}
