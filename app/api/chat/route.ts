import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  authorize,
  readState,
  budget,
  fail,
  ApiError,
  jsonBody,
  activity,
} from "@/lib/server";
import { activeFacts, whatMatters, applyActions } from "@/lib/engine";
import { AgentOutput } from "@/lib/agent/schema";
import { nextDayStart } from "@/lib/time";

export const runtime = "nodejs";
export const maxDuration = 60;

type OpenAIResponse = {
  status?: string;
  output?: { content?: { type: string; text?: string }[] }[];
};

function outputText(data: OpenAIResponse) {
  return (data.output ?? [])
    .flatMap((x) => x.content ?? [])
    .filter((x) => x.type === "output_text")
    .map((x) => x.text ?? "")
    .join("")
    .trim();
}

function parseAgentOutput(text: string) {
  return AgentOutput.parse(
    JSON.parse(
      text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim(),
    ),
  );
}

function upstreamError(status: number, raw: string) {
  let code = "";
  try {
    code = JSON.parse(raw)?.error?.code ?? "";
  } catch {}
  if (status === 429 && code === "insufficient_quota")
    return new ApiError(
      503,
      "מכסת ה-AI הסתיימה כרגע. לא בוצעו שינויים; אפשר להמשיך ידנית או לנסות לאחר חידוש הקרדיט.",
      "ai_insufficient_quota",
    );
  if (status === 429)
    return new ApiError(
      429,
      "שירות ה-AI עמוס כרגע. לא בוצעו שינויים; אפשר לנסות שוב בעוד רגע.",
      "ai_rate_limited",
    );
  if (status === 401 || status === 403)
    return new ApiError(
      503,
      "חיבור ה-AI דורש תיקון בהגדרות השרת. לא בוצעו שינויים.",
      "ai_configuration",
    );
  return new ApiError(
    502,
    "הסוכן לא הצליח לענות כרגע. לא בוצעו שינויים; אפשר לנסות שוב.",
    "ai_upstream",
  );
}

async function callAgent(
  model: string,
  instructions: string,
  input: unknown,
): Promise<{ parsed: z.infer<typeof AgentOutput>; model: string }> {
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(22_000),
      body: JSON.stringify({
        model,
        store: false,
        instructions,
        input: [{ role: "user", content: JSON.stringify(input) }],
        text: {
          format: {
            type: "json_schema",
            name: "household_agent_output",
            strict: false,
            schema: z.toJSONSchema(AgentOutput),
          },
        },
        max_output_tokens: 3500,
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError")
      throw new ApiError(
        504,
        "הסוכן התעכב יותר מדי. לא בוצעו שינויים; אפשר לנסות שוב.",
        "ai_timeout",
      );
    throw new ApiError(
      502,
      "לא הצלחנו להגיע לשירות ה-AI. לא בוצעו שינויים.",
      "ai_network",
    );
  }

  const raw = await response.text();
  if (!response.ok) {
    console.error("OpenAI chat upstream error", { model, status: response.status });
    throw upstreamError(response.status, raw);
  }

  let data: OpenAIResponse;
  try {
    data = JSON.parse(raw);
  } catch {
    console.error("OpenAI response JSON parse failed", { model });
    throw new ApiError(
      502,
      "הסוכן החזיר תשובה לא תקינה. לא בוצעו שינויים.",
      "ai_invalid_json",
    );
  }
  if (data.status !== "completed")
    throw new ApiError(
      502,
      "התשובה לא הושלמה. לא בוצעו שינויים; אפשר לנסות שוב.",
      "ai_incomplete",
    );
  const text = outputText(data);
  if (!text)
    throw new ApiError(
      502,
      "הסוכן לא החזיר תשובה. לא בוצעו שינויים.",
      "ai_empty",
    );
  try {
    return { parsed: parseAgentOutput(text), model };
  } catch (error) {
    console.error("OpenAI agent payload parse failed", {
      model,
      error: error instanceof Error ? error.name : "unknown",
    });
    throw new ApiError(
      502,
      "הסוכן החזיר תשובה לא תקינה. לא בוצעו שינויים; אפשר לנסח שוב.",
      "ai_invalid_output",
    );
  }
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const started = Date.now();
  let ownerId: string | null = null;
  try {
    const { db, userId } = await authorize(req);
    ownerId = userId;
    const body = z
      .object({
        message: z.string().trim().min(1).max(6000),
        contextTaskId: z.string().uuid().nullable().optional(),
        idempotencyKey: z.string().uuid(),
      })
      .parse(await jsonBody(req, 20_000));
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify({
          message: body.message,
          contextTaskId: body.contextTaskId ?? null,
        }),
      )
      .digest("hex");
    const { data: cached, error: cachedError } = await db
      .from("chat_receipts")
      .select("request_hash,response")
      .eq("owner_id", userId)
      .eq("idempotency_key", body.idempotencyKey)
      .maybeSingle();
    if (cachedError)
      throw new ApiError(
        503,
        "לא ניתן לבדוק ניסיון שיחה קודם. אפשר לנסות שוב בעוד רגע.",
        "chat_receipt_unavailable",
      );
    if (cached) {
      if (cached.request_hash !== requestHash)
        throw new ApiError(
          409,
          "מזהה ניסיון השיחה כבר שייך להודעה אחרת.",
          "chat_idempotency_conflict",
        );
      return Response.json(cached.response, {
        headers: { "Cache-Control": "no-store", "X-Idempotent-Replay": "1" },
      });
    }

    const { state, revision } = await readState(db, userId);
    if (!state.profile.aiConsent)
      throw new ApiError(
        403,
        "אפשר להפעיל עזרה אישית בהגדרות, לאחר הסכמה לשימוש במידע.",
        "ai_consent_required",
      );
    if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL)
      throw new ApiError(
        503,
        "הסוכן עדיין לא מחובר. אפשר להוסיף ולנהל משימות ידנית.",
        "ai_not_configured",
      );

    await budget(userId, "chat", Number(process.env.AI_HOURLY_LIMIT) || 30);
    const instructions = await readFile(
      process.cwd() + "/lib/agent/INSTRUCTIONS.he.md",
      "utf8",
    );
    const now = new Date();
    const activeTasks = state.tasks.filter(
      (t) => t.status === "open" || t.status === "unknown",
    );
    const context = {
      now: now.toISOString(),
      endOfToday: nextDayStart(now, state.profile.timezone),
      profile: state.profile,
      facts: activeFacts(state),
      tasks: activeTasks.slice(-100),
      shopping: state.shopping.filter((x) => !x.purchasedAt).slice(-100),
      reminders: state.reminders.filter((r) => r.status === "pending").slice(-100),
      important: whatMatters(state).map((t) => t.id),
      contextTaskId: body.contextTaskId ?? null,
      history: state.messages.slice(-12),
    };
    const models = Array.from(
      new Set(
        [process.env.OPENAI_MODEL, process.env.OPENAI_FALLBACK_MODEL].filter(Boolean),
      ),
    ) as string[];

    let parsed: z.infer<typeof AgentOutput> | null = null;
    let selectedModel = "";
    let lastError: unknown;
    for (const model of models) {
      try {
        const result = await callAgent(model, instructions, {
          context,
          message: body.message,
        });
        parsed = result.parsed;
        selectedModel = result.model;
        break;
      } catch (error) {
        lastError = error;
        if (
          error instanceof ApiError &&
          (error.code === "ai_insufficient_quota" ||
            error.code === "ai_rate_limited" ||
            error.code === "ai_configuration")
        )
          throw error;
      }
    }
    if (!parsed)
      throw lastError ??
        new ApiError(502, "הסוכן לא הצליח לענות כרגע.", "ai_failed");

    if (parsed.confidence === "clarify") parsed.actions = [];
    if (parsed.actions.length)
      try {
        applyActions(state, parsed.actions, now, true);
      } catch {
        throw new ApiError(
          502,
          "לא הצלחתי להכין שינוי מדויק. אפשר לנסח שוב? לא בוצעו פעולות.",
          "ai_actions_invalid",
        );
      }

    const payload = { ...parsed, basedOnRevision: revision, requestId };
    const { error: receiptError } = await db.from("chat_receipts").upsert(
      {
        owner_id: userId,
        idempotency_key: body.idempotencyKey,
        request_hash: requestHash,
        response: payload,
      },
      { onConflict: "owner_id,idempotency_key", ignoreDuplicates: true },
    );
    if (receiptError)
      console.error("Chat receipt write failed", { requestId });

    await activity(userId, "ai.success", {
      requestId,
      latencyMs: Date.now() - started,
      model: selectedModel,
      actionCount: parsed.actions.length,
      confidence: parsed.confidence,
    });
    return Response.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (ownerId)
      await activity(ownerId, "ai.failure", {
        requestId,
        latencyMs: Date.now() - started,
        code: e instanceof ApiError ? e.code : "internal_error",
        status: e instanceof ApiError ? e.status : 500,
      });
    return fail(e, requestId);
  }
}
