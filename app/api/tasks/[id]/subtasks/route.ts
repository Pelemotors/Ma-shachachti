import { authorize, HttpError } from "@/lib/server-auth";
import { mutateSubtask, loadSubtasksForTask, SubtaskError } from "@/lib/task-subtasks";

export const runtime = "nodejs";

function fail(error: unknown) {
  if (error instanceof HttpError || error instanceof SubtaskError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: "שגיאת תתי־משימות." }, { status: 500 });
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { db, userId } = await authorize(req);
    const { id } = await context.params;
    const subtasks = await loadSubtasksForTask(db, userId, id);
    return Response.json({ subtasks });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { db, userId } = await authorize(req);
    const { id: taskId } = await context.params;
    const body = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const action = body.action;
    if (action === "add") {
      const title = typeof body.title === "string" ? body.title : "";
      const subtasks = await mutateSubtask(db, userId, {
        action: "add",
        task_id: taskId,
        title,
      });
      return Response.json({ subtasks });
    }
    if (action === "update") {
      const id = typeof body.id === "string" ? body.id : "";
      const title = typeof body.title === "string" ? body.title : "";
      const subtasks = await mutateSubtask(db, userId, {
        action: "update",
        id,
        title,
      });
      return Response.json({ subtasks });
    }
    if (action === "toggle") {
      const id = typeof body.id === "string" ? body.id : "";
      const done = body.done === true;
      const subtasks = await mutateSubtask(db, userId, {
        action: "toggle",
        id,
        done,
      });
      return Response.json({ subtasks });
    }
    if (action === "remove") {
      const id = typeof body.id === "string" ? body.id : "";
      const subtasks = await mutateSubtask(db, userId, {
        action: "remove",
        id,
      });
      return Response.json({ subtasks });
    }
    if (action === "reorder") {
      const ordered_ids = Array.isArray(body.ordered_ids)
        ? body.ordered_ids.filter((value): value is string => typeof value === "string")
        : [];
      const subtasks = await mutateSubtask(db, userId, {
        action: "reorder",
        task_id: taskId,
        ordered_ids,
      });
      return Response.json({ subtasks });
    }
    throw new HttpError(400, "פעולה לא נתמכת.");
  } catch (error) {
    return fail(error);
  }
}
