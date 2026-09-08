/**
 * Authenticated chat application smoke.
 * Exit codes: 0 = PASS, 1 = FAIL, 2 = NOT RUN (missing credentials).
 *
 * Env (never commit tokens):
 *   SMOKE_BASE_URL — default http://127.0.0.1:3000 or production URL
 *   SMOKE_ACCESS_TOKEN — Bearer token for a dedicated smoke test user
 *
 * Provider smoke is separate: npm run smoke:ai → /api/health/ai
 * This script is application Chat smoke, not OpenAI-only.
 */
const base = (process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const token = process.env.SMOKE_ACCESS_TOKEN;

async function main() {
  if (!token) {
    console.log("CHAT_SMOKE: NOT RUN — missing SMOKE_ACCESS_TOKEN");
    process.exit(2);
  }

  const health = await fetch(`${base}/api/health`, { cache: "no-store" });
  const healthBody = await health.json().catch(() => ({}));
  if (!health.ok) {
    console.error("CHAT_SMOKE: FAIL — /api/health", health.status, healthBody);
    process.exit(1);
  }
  if (healthBody.appSchemaVersion !== 2) {
    console.error("CHAT_SMOKE: FAIL — unexpected appSchemaVersion", healthBody);
    process.exit(1);
  }

  const turnId = crypto.randomUUID();
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: "בדיקת smoke — אל תשני כלום, רק אשרי שאת חיה.",
      contextTaskId: null,
      idempotencyKey: turnId,
      turnId,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) {
    console.log("CHAT_SMOKE: NOT RUN — auth rejected", res.status);
    process.exit(2);
  }
  if (!res.ok) {
    console.error("CHAT_SMOKE: FAIL", res.status, {
      code: body.code,
      requestId: body.requestId,
      error: body.error,
    });
    process.exit(1);
  }
  if (typeof body.reply !== "string" || !body.reply.trim()) {
    console.error("CHAT_SMOKE: FAIL — empty reply", body);
    process.exit(1);
  }
  console.log("CHAT_SMOKE: PASS", {
    requestId: body.requestId,
    turnId: body.turnId,
    deploymentVersion: body.deploymentVersion,
    hasProposal: Boolean(body.proposalId),
  });
  process.exit(0);
}

main().catch((e) => {
  console.error("CHAT_SMOKE: FAIL", e);
  process.exit(1);
});
