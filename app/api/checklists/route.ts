import { authorize, HttpError } from "@/lib/server-auth";
import { checklistMutationSchema, loadChecklists, mutateChecklist } from "@/lib/lists";

export const runtime = "nodejs";

function fail(error: unknown) {
  if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
  console.error("Lean checklists error");
  return Response.json({ error: "לא הצלחנו לעדכן את הרשימות." }, { status: 500 });
}

export async function GET(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const occurrenceKey = new URL(req.url).searchParams.get("occurrence_key") ?? undefined;
    return Response.json({ checklists: await loadChecklists(db, userId, occurrenceKey) });
  } catch (error) { return fail(error); }
}

export async function POST(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const parsed = checklistMutationSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "פעולת הרשימה אינה תקינה.");
    return Response.json({ checklists: await mutateChecklist(db, userId, parsed.data) });
  } catch (error) { return fail(error); }
}
