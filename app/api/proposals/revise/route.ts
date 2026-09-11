import { reviseProposal } from "@/lib/proposals";
import { authorize, HttpError } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const body = (await req.json().catch(() => null)) as {
      id?: unknown;
      summary?: unknown;
      actions?: unknown;
      expires_in_seconds?: unknown;
    } | null;
    if (
      !body ||
      typeof body.id !== "string" ||
      typeof body.summary !== "string" ||
      !Array.isArray(body.actions) ||
      (body.expires_in_seconds != null &&
        typeof body.expires_in_seconds !== "number")
    ) {
      throw new HttpError(400, "עדכון ההצעה אינו תקין.");
    }
    const proposal = await reviseProposal(db, userId, {
      id: body.id,
      summary: body.summary,
      actions: body.actions,
      expiresInSeconds: body.expires_in_seconds as number | undefined,
    });
    if (!proposal) throw new HttpError(404, "הצעה ממתינה לא נמצאה.");
    return Response.json({ proposal });
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("Proposal revise failed");
    return Response.json(
      { error: "לא הצלחנו לעדכן את ההצעה." },
      { status: 500 },
    );
  }
}
