import { HttpError } from "@/lib/server-auth";
import { authorizeCron, createServiceClient } from "@/lib/supabase-admin";
import { dispatchDueReminders } from "@/lib/reminder-dispatch";

export const runtime = "nodejs";
export const maxDuration = 60;

function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("Lean reminder cron error");
  return Response.json({ error: "שליחת תזכורות נכשלה." }, { status: 500 });
}

async function run(req: Request) {
  authorizeCron(req);
  const summary = await dispatchDueReminders(createServiceClient());
  return Response.json({ ok: true, ...summary });
}

export async function GET(req: Request) {
  try {
    return await run(req);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    return await run(req);
  } catch (error) {
    return jsonError(error);
  }
}
