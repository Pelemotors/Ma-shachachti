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
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL,
        store: false,
        instructions,
        input: [
          {
            role: "user",
            content: JSON.stringify({ context, message: body.message }),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "home_assistant",
            strict: false,
            schema: z.toJSONSchema(AgentOutput, { target: "draft-7" }),
          },
        },
        max_output_tokens: 3500,
      }),
    });
    if (!response.ok)
      throw new ApiError(
        502,
        "הסוכן לא הצליח לענות כרגע. ההודעה נשארת אצלך ואפשר לנסות שוב.",
      );
    const data = await response.json();
    if (data.status !== "completed")
      throw new ApiError(502, "התשובה לא הושלמה. לא בוצעו פעולות.");
    const text = (data.output ?? [])
      .flatMap(
        (x: { content?: { type: string; text?: string }[] }) => x.content ?? [],
      )
      .filter((x: { type: string }) => x.type === "output_text")
      .map((x: { text: string }) => x.text)
      .join("");
    const parsed = AgentOutput.parse(JSON.parse(text));
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
