import { GET as getActivity } from "@/app/api/admin/activity/route";
import { GET as getAi } from "@/app/api/admin/ai/route";
import { GET as getHealth } from "@/app/api/admin/health/route";
import { GET as getOverview } from "@/app/api/admin/overview/route";
import { GET as getTasks } from "@/app/api/admin/tasks/route";
import { GET as getUsers } from "@/app/api/admin/users/route";
import { adminJsonError } from "@/lib/admin-api";
import { isAdminDiagnosticCheck } from "@/lib/admin-diagnostic-contract";
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

const expensiveCheckStarted = new Map<string, number>();

async function runAdminApiChecks(req: Request) {
  const checks = [
    ["overview", getOverview],
    ["health", getHealth],
    ["activity", getActivity],
    ["ai", getAi],
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

    if (check === "database") return Response.json(await checkDatabase());
    if (check === "auth") return Response.json(await checkAuth(userId));
    if (check === "openai") return Response.json(await checkOpenAI());
    if (check === "storage") return Response.json(await checkStorage());
    if (check === "push-reminders") {
      return Response.json(await checkPushAndReminders());
    }
    if (check === "admin-apis") {
      const started = Date.now();
      return Response.json(
        checkAdminApiResponses(await runAdminApiChecks(req), started),
      );
    }
    if (check === "full-health") {
      return Response.json(
        await runFullHealth(userId, await runAdminApiChecks(req)),
      );
    }

    const key = `${userId}:${check}`;
    const previous = expensiveCheckStarted.get(key) ?? 0;
    if (Date.now() - previous < 5_000) {
      return Response.json(
        { error: "הבדיקה כבר הופעלה. יש להמתין לפני ניסיון נוסף." },
        { status: 429 },
      );
    }
    expensiveCheckStarted.set(key, Date.now());
    return Response.json(await runLocalDiagnosticCommand(check));
  } catch (error) {
    return adminJsonError(error);
  }
}
