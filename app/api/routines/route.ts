import { authorize, HttpError } from "@/lib/server-auth";
import { DATE_RE } from "@/lib/time";
import {
  applyRoutineException,
  createRoutine,
  jerusalemToday,
  loadRoutineExceptionsForDate,
  loadRoutines,
  stopRoutine,
  updateRoutine,
} from "@/lib/routines";

export const runtime = "nodejs";

function fail(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: "לא הצלחנו לעדכן משימה קבועה." }, { status: 500 });
}

export async function GET(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const dateParam = new URL(req.url).searchParams.get("date");
    const date = dateParam && DATE_RE.test(dateParam) ? dateParam : jerusalemToday();
    const [routines, exceptions] = await Promise.all([
      loadRoutines(db, userId),
      loadRoutineExceptionsForDate(db, userId, date),
    ]);
    return Response.json({ routines, exceptions, date });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const body = await req.json().catch(() => null);
    const action = body?.action;
    if (action === "create") {
      await createRoutine(db, userId, {
        taskId: String(body.task_id ?? ""),
        weekdays: Array.isArray(body.weekdays) ? body.weekdays : [],
        timeOfDay: body.time_of_day ?? null,
        startsOn: String(body.starts_on ?? ""),
        endsOn: body.ends_on ?? null,
      });
    } else if (action === "update") {
      if (typeof body.id !== "string") throw new HttpError(400, "חסרה משימה קבועה.");
      await updateRoutine(db, userId, {
        id: body.id,
        ...(Array.isArray(body.weekdays) ? { weekdays: body.weekdays } : {}),
        ...(body.time_of_day !== undefined ? { timeOfDay: body.time_of_day } : {}),
        seriesScope: body.series_scope ?? "from_today",
        occurrenceDate: typeof body.occurrence_date === "string" ? body.occurrence_date : null,
        ...(body.ends_on !== undefined ? { endsOn: body.ends_on } : {}),
      });
    } else if (action === "stop") {
      if (typeof body.id !== "string") throw new HttpError(400, "חסרה משימה קבועה.");
      const from = typeof body.occurrence_date === "string" && DATE_RE.test(body.occurrence_date)
        ? body.occurrence_date
        : undefined;
      await stopRoutine(db, userId, body.id, from);
    } else if (action === "exception") {
      if (typeof body.id !== "string" || typeof body.occurrence_date !== "string" || typeof body.kind !== "string") {
        throw new HttpError(400, "חסרים פרטי המופע.");
      }
      await applyRoutineException(db, userId, {
        routineId: body.id,
        date: body.occurrence_date,
        kind: body.kind,
        timeOfDay: body.time_of_day ?? null,
      });
    } else {
      throw new HttpError(400, "פעולה אינה מוכרת.");
    }
    return Response.json({ routines: await loadRoutines(db, userId) });
  } catch (error) {
    return fail(error);
  }
}
