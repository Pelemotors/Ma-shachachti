import { UUID_RE } from "@/lib/action-schema";
import { rejectProposal } from "@/lib/proposals";
import { authorize, HttpError } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
    if (!body || typeof body.id !== "string" || !UUID_RE.test(body.id)) {
      throw new HttpError(400, "מזהה ההצעה אינו תקין.");
    }
    if (!(await rejectProposal(db, userId, body.id))) {
      throw new HttpError(404, "הצעה ממתינה לא נמצאה.");
    }
    return Response.json({ rejected: true });
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("Proposal reject failed");
    return Response.json(
      { error: "לא הצלחנו לדחות את ההצעה." },
      { status: 500 },
    );
  }
}
