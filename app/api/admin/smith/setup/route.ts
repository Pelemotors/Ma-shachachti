import { adminJsonError } from "@/lib/admin-api";
import { authorizeAdmin } from "@/lib/server-auth";
import { getSmithSetupState } from "@/lib/smith/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await authorizeAdmin(req);
    return Response.json(
      {
        setup: getSmithSetupState(),
        verifications: {
          phase1aLocal: "passed",
          hostedTestEnvironment: "not_configured",
          mainProtection: "blocked",
          productionExecutor: "disconnected",
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return adminJsonError(error);
  }
}
