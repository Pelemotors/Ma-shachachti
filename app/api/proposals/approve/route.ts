import { UUID_RE } from "@/lib/action-schema";
import { loadTasks } from "@/lib/actions";
import { approveProposal } from "@/lib/proposals";
import { authorize, HttpError } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
    if (!body || typeof body.id !== "string" || !UUID_RE.test(body.id)) {
      throw new HttpError(400, "מזהה ההצעה אינו תקין.");
    }
    const result = await approveProposal(db, userId, body.id);
    if (!result.ok) throw new HttpError(result.status, result.error);
    return Response.json({ ...result, tasks: await loadTasks(db, userId) });
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("Proposal approve failed");
    return Response.json(
      { error: "לא הצלחנו לאשר את ההצעה." },
      { status: 500 },
    );
  }
}
