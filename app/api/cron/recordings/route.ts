import { recordActivity } from "@/lib/activity";
import { cleanupExpiredRecordings } from "@/lib/recordings";
import { authorizeCron, createServiceClient } from "@/lib/supabase-admin";
import { HttpError } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

async function run(req: Request) {
  authorizeCron(req);
  const db = createServiceClient();
  try {
    const summary = await cleanupExpiredRecordings(db);
    await recordActivity(db, {
      eventType: "cron.recordings.success",
      metadata: summary,
    });
    return Response.json({ ok: summary.failed === 0, ...summary });
  } catch (error) {
    await recordActivity(db, {
      eventType: "cron.recordings.failure",
      metadata: { error: "recording_retention_failed" },
    });
    throw error;
  }
}

function fail(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("Recording retention cron failed");
  return Response.json({ error: "ניקוי ההקלטות נכשל." }, { status: 500 });
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
