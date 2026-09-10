import { authorize, HttpError } from "@/lib/server-auth";
import { loadScheduleTasks } from "@/lib/actions";
import { classifyScheduleDay } from "@/lib/schedule";
import { DATE_RE, todayContext } from "@/lib/time";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const requested = new URL(req.url).searchParams.get("date");
    const date =
      requested && DATE_RE.test(requested) ? requested : todayContext().date;
    const tasks = await loadScheduleTasks(db, userId);
    const day = classifyScheduleDay(tasks, date);
    return Response.json({
      date,
      timed: day.timed.map((item) => ({
        ...item.task,
        start: item.start,
        end: item.end,
        fixed: item.fixed,
      })),
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "לא הצלחנו לטעון את הלוז." }, { status: 500 });
  }
}
