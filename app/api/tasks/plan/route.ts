import { authorize, HttpError } from "@/lib/server-auth";
import { saveTaskPlans } from "@/lib/actions";
import { DATE_RE, TIME_RE } from "@/lib/time";

export const runtime = "nodejs";

function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("Lean plan save error");
  return Response.json({ error: "לא הצלחנו לשמור את הלוז." }, { status: 500 });
}

export async function POST(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const body = (await req.json().catch(() => null)) as {
      date?: unknown;
      items?: unknown;
    } | null;
    if (!body || typeof body.date !== "string" || !DATE_RE.test(body.date)) {
      throw new HttpError(400, "תאריך הלוז אינו תקין.");
    }
    if (!Array.isArray(body.items) || !body.items.length) {
      throw new HttpError(400, "אין פריטים לשמירה.");
    }
    const items: Array<{
      task_id: string | null;
      title: string | null;
      planned_start: string;
      planned_end: string | null;
      anchor: "fixed" | "planned" | null;
    }> = [];
    for (const raw of body.items.slice(0, 20)) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as {
        task_id?: unknown;
        title?: unknown;
        planned_start?: unknown;
        planned_end?: unknown;
        anchor?: unknown;
      };
      const taskId = typeof item.task_id === "string" && item.task_id ? item.task_id : null;
      const title = typeof item.title === "string" ? item.title.trim() : "";
      if (!taskId && !title) continue;
      if (typeof item.planned_start !== "string" || !TIME_RE.test(item.planned_start)) {
        throw new HttpError(400, "שעת השיבוץ אינה תקינה.");
      }
      const anchor =
        item.anchor === "fixed" || item.anchor === "planned" ? item.anchor : null;
      items.push({
        task_id: taskId,
        title: title || null,
        planned_start: item.planned_start,
        planned_end:
          typeof item.planned_end === "string" && TIME_RE.test(item.planned_end)
            ? item.planned_end
            : null,
        anchor,
      });
    }
    if (!items.length) throw new HttpError(400, "אין פריטים לשמירה.");
    const tasks = await saveTaskPlans(db, userId, body.date, items);
    return Response.json({ tasks, saved: true });
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden_task") {
      return Response.json({ error: "משימה אינה שייכת לחשבון." }, { status: 403 });
    }
    return jsonError(error);
  }
}
