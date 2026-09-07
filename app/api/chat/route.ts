import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  authorize,
  readState,
  budget,
  fail,
  ApiError,
  jsonBody,
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
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  return AgentOutput.parse(JSON.parse(cleaned));
}

async function callAgent(
  model: string,
  instructions: string,
  input: unknown,
): Promise<{ parsed: z.infer<typeof AgentOutput>; model: string }> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(50000),
    body: JSON.stringify({
      model,
      store: false,
      instructions:
        instructions +
        "\n\nהחזר אובייקט JSON גולמי בלבד, ללא markdown וללא טקסט מחוץ ל-JSON. השדות: reply, confidence, actions.",
      input: [
        {
          role: "user",
          content: JSON.stringify(input),
        },
      ],
      max_output_tokens: 3500,
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    console.error("OpenAI chat upstream error", {
      model,
      status: response.status,
      detail: raw.slice(0, 1000),
    });
    throw new ApiError(
      response.status === 429 ? 429 : 502,
      response.status === 429
        ? "יש עומס זמני על שירות ה-AI. אפשר לנסות שוב בעוד רגע."
        : "הסוכן לא הצליח לענות כרגע. אפשר לנסות שוב.",
    );
  }

  let data: OpenAIResponse;
  try {
    data = JSON.parse(raw) as OpenAIResponse;
  } catch {
    console.error("OpenAI returned non-JSON envelope", { model, detail: raw.slice(0, 500) });
    throw new ApiError(502, "הסוכן החזיר תשובה לא תקינה. אפשר לנסות שוב.");
  }

  if (data.status !== "completed") {
    console.error("OpenAI response incomplete", { model, status: data.status });
    throw new ApiError(502, "התשובה לא הושלמה. אפשר לנסות שוב.");
  }

  const text = outputText(data);
  if (!text) {
    console.error("OpenAI response had no output_text", { model });
    throw new ApiError(502, "הסוכן לא החזיר תשובה. אפשר לנסות שוב.");
  }

  try {
    return { parsed: parseAgentOutput(text), model };
  } catch (error) {
    console.error("OpenAI agent payload parse failed", {
      model,
      error: error instanceof Error ? error.message : "unknown",
      detail: text.slice(0, 1000),
    });
    throw new ApiError(502, "הסוכן החזיר תשובה לא תקינה. אפשר לנסות שוב.");
  }
}

export async function POST(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const body = z
      .object({
        message: z.string().trim().min(1).max(6000),
        contextTaskId: z.string().uuid().nullable().optional(),
      })
      .parse(await jsonBody(req, 20000));
    const { state, revision } = await readState(db, userId);

    if (!state.profile.aiConsent)
      throw new ApiError(
        403,
        "אפשר להפעיל עזרה אישית בהגדרות, לאחר הסכמה לשימוש במידע.",
      );
    if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL)
      throw new ApiError(
        503,
        "הסוכן עדיין לא מחובר. אפשר להוסיף ולנהל משימות ידנית.",
      );

    await budget(userId, "chat", Number(process.env.AI_HOURLY_LIMIT) || 30);
    const instructions = await readFile(
      process.cwd() + "/lib/agent/INSTRUCTIONS.he.md",
      "utf8",
    );
    const now = new Date();
    const context = {
      now: now.toISOString(),
      endOfToday: nextDayStart(now, state.profile.timezone),
      profile: state.profile,
      facts: activeFacts(state),
      tasks: state.tasks.filter((t) => t.status !== "cancelled").slice(-200),
      shopping: state.shopping.filter((x) => !x.purchasedAt),
      reminders: state.reminders.filter((r) => r.status === "pending"),
      important: whatMatters(state).map((t) => t.id),
      contextTaskId: body.contextTaskId ?? null,
      history: state.messages.slice(-16),
    };

    const models = Array.from(
      new Set([process.env.OPENAI_MODEL, "gpt-5.6-luna"].filter(Boolean)),
    ) as string[];

    let parsed: z.infer<typeof AgentOutput> | null = null;
    let lastError: unknown;
    for (const model of models) {
      try {
        parsed = (await callAgent(model, instructions, { context, message: body.message }))
          .parsed;
        break;
      } catch (error) {
        lastError = error;
        if (error instanceof ApiError && error.status === 429) throw error;
      }
    }
    if (!parsed) throw lastError ?? new ApiError(502, "הסוכן לא הצליח לענות כרגע.");

    if (parsed.confidence === "clarify") parsed.actions = [];

    // Reject invented references, cyclic dependencies and invalid future times before any proposal reaches the UI.
    if (parsed.actions.length)
      try {
        applyActions(state, parsed.actions, now, true);
      } catch {
        throw new ApiError(
          502,
          "לא הצלחתי להכין שינוי מדויק. אפשר לנסח שוב? לא בוצעו פעולות.",
        );
      }

    return Response.json(
      { ...parsed, basedOnRevision: revision },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
