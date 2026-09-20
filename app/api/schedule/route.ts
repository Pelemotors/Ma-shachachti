import { authorize, HttpError } from "@/lib/server-auth";
import { loadScheduleTasks } from "@/lib/actions";
import { loadDayPlan } from "@/lib/day-plan";
import { jerusalemParts } from "@/lib/time";
import { DATE_RE, todayContext } from "@/lib/time";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const requested = new URL(req.url).searchParams.get("date");
    const date =
      requested && DATE_RE.test(requested) ? requested : todayContext().date;
    const { items } = await loadDayPlan(db, userId, date);
    const tasks = await loadScheduleTasks(db, userId);
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const timed = items
      .map((item) => {
        const task = byId.get(String(item.task_id));
        if (!task) return null;
        return {
          ...task,
          start: jerusalemParts(String(item.start_at)).time,
          end: item.end_at ? jerusalemParts(String(item.end_at)).time : null,
          fixed: item.kind === "fixed",
        };
      })
      .filter(Boolean);
    return Response.json({
      date,
      timed,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "לא הצלחנו לטעון את הלוז." }, { status: 500 });
  }
}
