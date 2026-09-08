/**
 * AI provider smoke against /api/health/ai (authenticated).
 * Exit codes: 0 = PASS, 1 = FAIL, 2 = NOT RUN (missing credentials).
 *
 * Env:
 *   SMOKE_BASE_URL — default http://127.0.0.1:3000
 *   SMOKE_ACCESS_TOKEN — Bearer token for authorize()
 *   OPENAI_API_KEY — required on server; if absent locally we report NOT RUN
 */
const base = (process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const token = process.env.SMOKE_ACCESS_TOKEN;

async function main() {
  if (!token) {
    console.log("AI_SMOKE: NOT RUN — missing SMOKE_ACCESS_TOKEN");
    process.exit(2);
  }
  if (!process.env.OPENAI_API_KEY && process.env.SMOKE_REQUIRE_LOCAL_KEY === "1") {
    console.log("AI_SMOKE: NOT RUN — missing OPENAI_API_KEY");
    process.exit(2);
  }

  const res = await fetch(`${base}/api/health/ai`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) {
    console.log("AI_SMOKE: NOT RUN — auth rejected", res.status);
    process.exit(2);
  }
  if (!res.ok || body.ok !== true) {
    console.error("AI_SMOKE: FAIL", res.status, body);
    process.exit(1);
  }
  console.log("AI_SMOKE: PASS", {
    model: body.model,
    latencyMs: body.latencyMs,
  });
  process.exit(0);
}

main().catch((e) => {
  console.error("AI_SMOKE: FAIL", e);
  process.exit(1);
});
