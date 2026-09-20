import { authorize, HttpError } from "@/lib/server-auth";
import { enqueueJob, getJob } from "@/lib/jobs";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new HttpError(400, "חסר מזהה עבודה.");
    return Response.json({ job: await getJob(db, userId, id) });
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "טעינת העבודה נכשלה." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const body = (await req.json()) as {
      job_type?: "bank_intake" | "brain_dump" | "transcription";
      idempotency_key?: string;
      recording_id?: string;
    };
    if (!body.job_type || !body.idempotency_key) {
      throw new HttpError(400, "חסרים פרטי עבודה.");
    }
    const job = await enqueueJob(db, userId, {
      job_type: body.job_type,
      idempotency_key: body.idempotency_key,
      recording_id: body.recording_id,
    });
    return Response.json({ job });
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "הכנסה לתור נכשלה." }, { status: 500 });
  }
}
