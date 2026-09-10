import { authorize, HttpError } from "@/lib/server-auth";
import { executeAction, loadTasks, parseActions } from "@/lib/actions";

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
    const actions = parseActions(body?.actions ?? [body]);
    if (!actions.length) throw new HttpError(400, "לא התקבלה פעולה תקינה.");
    if (actions.length > 10)
      throw new HttpError(400, "יותר מדי פעולות בבת אחת.");

    const results = [];
    for (const action of actions) {
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
