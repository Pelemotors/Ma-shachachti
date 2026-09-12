import { GET as getActivity } from "@/app/api/admin/activity/route";
import { GET as getAi } from "@/app/api/admin/ai/route";
import { GET as getHealth } from "@/app/api/admin/health/route";
import { GET as getIncidents } from "@/app/api/admin/incidents/route";
import { GET as getOverview } from "@/app/api/admin/overview/route";
import { GET as getTasks } from "@/app/api/admin/tasks/route";
import { GET as getUsers } from "@/app/api/admin/users/route";
import { adminJsonError } from "@/lib/admin-api";
import {
  isAdminDiagnosticCheck,
  type AdminDiagnosticCheck,
  type DiagnosticResult,
} from "@/lib/admin-diagnostic-contract";
import {
  checkAdminApiResponses,
  checkAuth,
  checkDatabase,
  checkOpenAI,
  checkPushAndReminders,
  checkStorage,
  runFullHealth,
  runLocalDiagnosticCommand,
} from "@/lib/admin-diagnostics";
import { authorizeAdmin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inFlightChecks = new Set<string>();

async function runAdminApiChecks(req: Request) {
  const checks = [
    ["overview", getOverview],
    ["health", getHealth],
    ["activity", getActivity],
    ["ai", getAi],
    ["incidents", getIncidents],
    ["tasks", getTasks],
    ["users", getUsers],
  ] as const;
  return Promise.all(
    checks.map(async ([name, handler]) => {
      const response = await handler(req);
      return { name, status: response.status, ok: response.ok };
    }),
  );
}

async function executeCheck(
  check: AdminDiagnosticCheck,
  req: Request,
  userId: string,
): Promise<DiagnosticResult> {
  if (check === "database") return checkDatabase();
  if (check === "auth") return checkAuth(userId);
  if (check === "openai") return checkOpenAI();
  if (check === "storage") return checkStorage();
  if (check === "push-reminders") return checkPushAndReminders();
  if (check === "admin-apis") {
    const started = Date.now();
    return checkAdminApiResponses(await runAdminApiChecks(req), started);
  }
  if (check === "full-health") {
    const started = Date.now();
    return runFullHealth(userId, await runAdminApiChecks(req), started);
  }
  return runLocalDiagnosticCommand(check);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ check: string }> },
) {
  try {
    const { userId } = await authorizeAdmin(req);
    const { check } = await params;
    if (!isAdminDiagnosticCheck(check)) {
      return Response.json({ error: "בדיקה לא מוכרת." }, { status: 404 });
    }

    const key = `${userId}:${check}`;
    if (inFlightChecks.has(key)) {
      return Response.json(
        {
          error: "הבדיקה כבר פועלת.",
          code: "diagnostic_already_running",
        },
        { status: 409 },
      );
    }
    inFlightChecks.add(key);
    try {
      return Response.json(await executeCheck(check, req, userId), {
        headers: { "Cache-Control": "no-store" },
      });
    } finally {
      inFlightChecks.delete(key);
    }
  } catch (error) {
    return adminJsonError(error);
  }
}
