import { authorize, HttpError } from "@/lib/server-auth";
import { DATE_RE } from "@/lib/time";
import { jerusalemDayRange } from "@/lib/schedule";
import {
  detectConflicts,
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
    const plan = await loadDayPlan(db, userId, date, household);
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
      calendar_item?: { task_id: string; start_at: string; end_at?: string | null };
    };
    if (!body.date || !DATE_RE.test(body.date)) {
      throw new HttpError(400, "תאריך אינו תקין.");
    }
    const household = body.scope === "household";
    if (body.action === "replan") {
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
      );
      return Response.json(result);
    }
    if (body.action === "add_from_calendar") {
      if (!body.calendar_item) throw new HttpError(400, "חסר אירוע לשיבוץ.");
      const current = await loadDayPlan(db, userId, body.date, household);
      const next = [
        ...(current.items as DayPlanItemInput[]).map((item) => ({
          task_id: String(item.task_id),
          start_at: String(item.start_at),
          end_at: item.end_at ? String(item.end_at) : null,
          kind: (item.kind === "fixed" ? "fixed" : "flexible") as "fixed" | "flexible",
          source: (item.source === "calendar"
            ? "calendar"
            : item.source === "replan"
              ? "replan"
              : "manual") as DayPlanItemInput["source"],
        })),
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
