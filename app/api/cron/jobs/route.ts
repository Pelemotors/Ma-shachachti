import { authorizeCron, createServiceClient } from "@/lib/supabase-admin";
import { processQueuedJobs } from "@/lib/jobs";
import { HttpError } from "@/lib/server-auth";

export const runtime = "nodejs";

async function run(req: Request) {
  authorizeCron(req);
  const summary = await processQueuedJobs(createServiceClient());
  return Response.json(summary);
}

function fail(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: "עיבוד התור נכשל." }, { status: 500 });
}

export async function GET(req: Request) {
  try {
    return await run(req);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    return await run(req);
  } catch (error) {
    return fail(error);
  }
}
