import { adminJsonError } from "@/lib/admin-api";
import { createServiceClient } from "@/lib/supabase-admin";
import { authorizeAdmin } from "@/lib/server-auth";
import {
  emptySmithDashboard,
  smithControlEnabled,
} from "@/lib/smith/dashboard";
import { loadSmithDashboard } from "@/lib/smith/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await authorizeAdmin(req);
    if (!smithControlEnabled()) {
      return Response.json(emptySmithDashboard(), {
        headers: { "Cache-Control": "no-store" },
      });
    }

    const data = await loadSmithDashboard(createServiceClient());
    return Response.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return adminJsonError(error);
  }
}
