export const runtime = "nodejs";
export const maxDuration = 20;

export async function GET(req: Request) {
  const started = Date.now();
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`)
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  if (!key || !model) return Response.json({ ok: false, error: "openai_not_configured" }, { status: 503 });

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ model, store: false, input: "Reply with exactly: OK", max_output_tokens: 16 }),
    });
    const raw = await response.text();
    if (!response.ok) {
      let code = "upstream_error";
      try { const parsed = JSON.parse(raw); code = parsed?.error?.code ?? parsed?.error?.type ?? code; } catch {}
      console.error("AI_SMOKE_FAIL", { model, status: response.status, code, latencyMs: Date.now() - started });
      return Response.json({ ok: false, model, upstreamStatus: response.status, code, latencyMs: Date.now() - started }, { status: 502 });
    }
    const data = JSON.parse(raw);
    const text = (data.output ?? []).flatMap((x:any)=>x.content ?? []).filter((x:any)=>x.type === "output_text").map((x:any)=>x.text ?? "").join("").trim();
    const ok = data.status === "completed" && text === "OK";
    console.log(ok ? "AI_SMOKE_OK" : "AI_SMOKE_BAD_OUTPUT", { model, upstreamStatus: data.status, latencyMs: Date.now() - started });
    return Response.json({ ok, model, upstreamStatus: data.status, latencyMs: Date.now() - started }, { status: ok ? 200 : 502 });
  } catch (error) {
    console.error("AI_SMOKE_EXCEPTION", { error: error instanceof Error ? error.message : "unknown", latencyMs: Date.now() - started });
    return Response.json({ ok: false, error: "request_failed", latencyMs: Date.now() - started }, { status: 502 });
  }
}
