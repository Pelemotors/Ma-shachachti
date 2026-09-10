import { authorize, HttpError } from "@/lib/server-auth";
import { inspectActions } from "@/lib/action-schema";
import { executeAction, loadTasks } from "@/lib/actions";

export const runtime = "nodejs";

function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("Lean tasks error");
  return Response.json(
    { error: "לא הצלחנו לעדכן את המשימות." },
    { status: 500 },
  );
}

export async function GET(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const tasks = await loadTasks(db, userId);
    return Response.json({ tasks });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const body = await req.json().catch(() => null);
    const inspected = inspectActions(body?.actions ?? [body]);
    if (
      inspected.results.some((result) => !result.ok) ||
      !inspected.accepted.length
    ) {
      throw new HttpError(400, "לא התקבלה פעולה תקינה.");
    }

    const results = [];
    for (const action of inspected.accepted) {
      if (!action.type.startsWith("task.")) {
        throw new HttpError(400, "מכאן אפשר לעדכן רק משימות.");
      }
      results.push(await executeAction(db, userId, action));
    }
    if (results.some((result) => !result.ok)) {
      throw new HttpError(503, "לא הצלחנו לשמור את כל השינויים.");
    }

    const tasks = await loadTasks(db, userId);
    return Response.json({ tasks, results });
  } catch (error) {
    return jsonError(error);
  }
}
