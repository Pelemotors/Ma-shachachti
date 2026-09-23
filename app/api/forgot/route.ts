import { authorize, HttpError } from "@/lib/server-auth";
import { loadTasks } from "@/lib/actions";
import { loadConsequences } from "@/lib/consequences";
import { buildForgottenSurface } from "@/lib/forgotten-surface";
import { loadDayPlan } from "@/lib/day-plan";
import { todayContext } from "@/lib/time";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const tasks = await loadTasks(db, userId);
    const consequences = await loadConsequences(
      db,
      userId,
      tasks.map((task) => task.id),
    );
    let planTaskIds: string[] = [];
    try {
      const plan = await loadDayPlan(db, userId, todayContext().date);
      planTaskIds = (plan?.items ?? [])
        .map((item) => String((item as { task_id?: string }).task_id ?? ""))
        .filter(Boolean);
    } catch {
      planTaskIds = [];
    }
    const surface = buildForgottenSurface({
      tasks,
      consequences: [...consequences.values()],
      planTaskIds,
    });
    return Response.json(surface);
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("Forgot surface error");
    return Response.json({ error: "לא הצלחנו לטעון את מה שכחתי." }, { status: 500 });
  }
}
