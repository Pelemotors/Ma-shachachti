import phase1a from "@/docs/smith/evidence/PHASE_1A_LOCAL.json";
import phase6 from "@/docs/smith/evidence/PHASE_6_PLAYWRIGHT_LOCAL.json";
import { adminJsonError } from "@/lib/admin-api";
import { authorizeAdmin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await authorizeAdmin(req);
    return Response.json(
      {
        phase1a: {
          status: phase1a.result,
          environment: phase1a.environment,
          generatedAt: phase1a.generatedAt,
          productionConnected: phase1a.productionConnected,
        },
        playwright: {
          status: phase6.status,
          environment: phase6.environment,
          executedAt: phase6.executedAt,
          results: phase6.results,
          sourceState: phase6.sourceState,
          approvalEvidence: phase6.approvalEvidence,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return adminJsonError(error);
  }
}
