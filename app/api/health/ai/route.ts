import { authorize, ApiError, fail } from "@/lib/server";

export const runtime = "nodejs";
export const maxDuration = 20;

export async function POST(req: Request) {
  const started = Date.now();
  try {
    await authorize(req);
    const key = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL;
    if (!key || !model) throw new ApiError(503, "OpenAI is not configured");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        model,
        store: false,
        input: "Reply with exactly: OK",
        max_output_tokens: 16,
      }),
    });
    const raw = await response.text();
    if (!response.ok) {
      let code = "upstream_error";
      try { code = JSON.parse(raw)?.error?.code ?? JSON.parse(raw)?.error?.type ?? code; } catch {}
      return Response.json({ ok: false, provider: "openai", model, status: response.status, code, latencyMs: Date.now()-started }, { status: 502 });
    }
    const data = JSON.parse(raw);
    const text = (data.output ?? []).flatMap((x:any)=>x.content ?? []).filter((x:any)=>x.type==="output_text").map((x:any)=>x.text??"").join("").trim();
    return Response.json({ ok: data.status === "completed" && text === "OK", provider: "openai", model, upstreamStatus: data.status, latencyMs: Date.now()-started }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return fail(e); }
}
