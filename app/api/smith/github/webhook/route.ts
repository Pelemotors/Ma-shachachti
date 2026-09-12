import { createServiceClient } from "@/lib/supabase-admin";
import { smithControlEnabled } from "@/lib/smith/dashboard";
import {
  requireGitHubDeliveryId,
  sanitizeGitHubPayload,
  verifyGitHubWebhookSignature,
} from "@/lib/smith/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.SMITH_GITHUB_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return Response.json(
      { error: "GitHub עדיין לא מחובר ל-Smith." },
      { status: 503 },
    );
  }

  const body = await req.text();
  if (
    !verifyGitHubWebhookSignature(
      body,
      req.headers.get("x-hub-signature-256"),
      secret,
    )
  ) {
    return Response.json({ error: "Invalid signature." }, { status: 401 });
  }

  let idempotencyKey: string;
  try {
    idempotencyKey = requireGitHubDeliveryId(
      req.headers.get("x-github-delivery"),
    );
  } catch {
    return Response.json({ error: "Invalid delivery." }, { status: 400 });
  }

  if (!smithControlEnabled()) {
    return Response.json(
      { error: "Smith Control Plane עדיין לא הוגדר." },
      { status: 503 },
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const repository = parsed.repository as
    { full_name?: unknown; id?: unknown } | undefined;
  const pullRequest = parsed.pull_request as
    { number?: unknown; head?: { sha?: unknown } } | undefined;
  const payload = sanitizeGitHubPayload({
    event: req.headers.get("x-github-event"),
    action: parsed.action,
    repositoryId: repository?.id,
    repository: repository?.full_name,
    pullRequestNumber: pullRequest?.number,
    pullRequestHeadSha: pullRequest?.head?.sha,
  });

  const db = createServiceClient().schema("smith_control");
  const inserted = await db
    .from("smith_jobs")
    .insert({
      job_type: "github.webhook",
      payload,
      idempotency_key: idempotencyKey,
      max_attempts: 3,
    })
    .select("id")
    .single();

  if (inserted.error?.code === "23505") {
    return Response.json({ accepted: true, replay: true }, { status: 202 });
  }
  if (inserted.error) {
    return Response.json(
      { error: "Webhook persistence failed." },
      { status: 503 },
    );
  }
  return Response.json(
    { accepted: true, replay: false, jobId: inserted.data.id },
    { status: 202 },
  );
}
