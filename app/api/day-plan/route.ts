import { authorize, HttpError } from "@/lib/server-auth";
import { DATE_RE, TIME_RE } from "@/lib/time";
import { jerusalemDayRange } from "@/lib/schedule";
import {
  dayPlanItemFromRow,
  detectConflicts,
  ensureRoutineOccurrences,
  itemFromExplicitCalendarAction,
  loadDayPlan,
  replanDay,
  updateDayPlan,
  type DayPlanItemInput,
} from "@/lib/day-plan";
import { loadCalendarConstraints } from "@/lib/calendar";

export const runtime = "nodejs";

function jsonError(error: unknown, fallback: string) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: fallback }, { status: 500 });
}

export async function GET(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const url = new URL(req.url);
    const date = url.searchParams.get("date") || "";
    if (!DATE_RE.test(date)) throw new HttpError(400, "תאריך אינו תקין.");
    const household = url.searchParams.get("scope") === "household";
    // Initialize/read canonical day_plan for the date. Materializes timed routines only —
    // never runs replanDay (that requires explicit POST action=replan).
    const plan = await ensureRoutineOccurrences(db, userId, date, household);
    const range = jerusalemDayRange(date);
    const constraints = await loadCalendarConstraints(
      db,
      userId,
      range.start,
      range.end,
    );
    return Response.json({
      ...plan,
      constraints,
      conflicts: detectConflicts(
        plan.items as Array<{ start_at: string; end_at?: string | null }>,
        constraints,
      ),
    });
  } catch (error) {
    return jsonError(error, "לא הצלחנו לטעון את הלוז.");
  }
}

export async function POST(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const body = (await req.json()) as {
      action?: string;
      date?: string;
      scope?: string;
      items?: DayPlanItemInput[];
      task_ids?: string[];
      window_start?: string;
      window_end?: string;
      planning_context?: string;
      plan_updated_at?: string | null;
      calendar_item?: { task_id: string; start_at: string; end_at?: string | null };
    };
    if (!body.date || !DATE_RE.test(body.date)) {
      throw new HttpError(400, "תאריך אינו תקין.");
    }
    const household = body.scope === "household";
    if (body.action === "replan") {
      if ((body.window_start && !TIME_RE.test(body.window_start)) || (body.window_end && !TIME_RE.test(body.window_end))) {
        throw new HttpError(400, "טווח השעות אינו תקין.");
      }
      if (body.window_start && body.window_end && body.window_start >= body.window_end) {
        throw new HttpError(400, "שעת ההתחלה חייבת להיות לפני שעת הסיום.");
      }
      const range = jerusalemDayRange(body.date);
      const constraints = await loadCalendarConstraints(
        db,
        userId,
        range.start,
        range.end,
      );
      const result = await replanDay(
        db,
        userId,
        body.date,
        Array.isArray(body.task_ids) ? body.task_ids : [],
        constraints,
        household,
        {
          windowStart: body.window_start,
          windowEnd: body.window_end,
          planningContext: body.planning_context,
          planUpdatedAt: body.plan_updated_at,
        },
      );
      return Response.json(result);
    }
    if (body.action === "add_from_calendar") {
      if (!body.calendar_item) throw new HttpError(400, "חסר אירוע לשיבוץ.");
      const current = await loadDayPlan(db, userId, body.date, household);
      const next = [
        ...(current.items as Record<string, unknown>[]).flatMap((raw) => {
          const item = dayPlanItemFromRow(raw);
          return item ? [item] : [];
        }),
        itemFromExplicitCalendarAction(body.calendar_item),
      ];
      return Response.json(await updateDayPlan(db, userId, body.date, next, household));
    }
    if (!Array.isArray(body.items)) throw new HttpError(400, "חסרים פריטים.");
    return Response.json(
      await updateDayPlan(db, userId, body.date, body.items, household),
    );
  } catch (error) {
    return jsonError(error, "לא הצלחנו לשמור את הלוז.");
  }
}
