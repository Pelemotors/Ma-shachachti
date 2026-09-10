import { authorize, HttpError } from "@/lib/server-auth";
import { clearUserTasks } from "@/lib/actions";

export const runtime = "nodejs";

function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("Lean clear tasks error");
  return Response.json({ error: "לא הצלחנו לנקות את המשימות." }, { status: 500 });
}

export async function POST(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const tasks = await clearUserTasks(db, userId);
    return Response.json({ tasks });
  } catch (error) {
    return jsonError(error);
  }
}
