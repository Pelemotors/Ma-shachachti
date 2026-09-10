import { authorize, HttpError } from "@/lib/server-auth";
import { composeReply } from "@/lib/action-schema";
import { loadMemory, loadTasks, runRequestedActions } from "@/lib/actions";
import { loadConsequences, persistConsequenceUpdates } from "@/lib/consequences";
import {
  AGENT_TURN_JSON_SCHEMA,
  applySurfaceTurnPolicy,
  buildInstructions,
  parseDecision,
  surfaceInputHint,
} from "@/lib/agent/turn";
import { recordActivity } from "@/lib/activity";
import { parseChatRequest } from "@/lib/chat-request";
import {
  latestOrCreateChatSession,
  loadSessionMessages,
  ownChatSession,
  resolveReadableChatSession,
} from "@/lib/chat-sessions";
import {
  replyForPresentation,
  resolveAgentPresentation,
} from "@/lib/presentation";
import { createServiceClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 60;

type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

type OpenAIResponse = {
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

function extractText(data: OpenAIResponse) {
  return (data.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter(
      (part) => part.type === "output_text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("Lean chat error");
  return Response.json(
    { error: "הסוכן לא הצליח לענות כרגע. אפשר לנסות שוב." },
    { status: 500 },
  );
}

async function trackAi(
  userId: string,
  eventType: "ai.success" | "ai.failure",
  metadata: Record<string, unknown>,
) {
  try {
    await recordActivity(createServiceClient(), {
      ownerId: userId,
      eventType,
      metadata,
    });
  } catch {
    /* telemetry must not break chat */
  }
}

export async function GET(req: Request) {
  try {
    const { db, userId } = await authorize(req);
    const requested = new URL(req.url).searchParams.get("session_id");
    const resolved = await resolveReadableChatSession(db, userId, requested);
    if (!resolved.ok) {
      if (resolved.status === 400) {
        throw new HttpError(400, "מזהה השיחה אינו תקין.");
      }
      if (resolved.status === 403) {
        throw new HttpError(403, "שיחת היעד אינה שייכת לחשבון הזה.");
      }
      throw new HttpError(503, "לא הצלחנו לפתוח שיחה.");
    }
    let messages: StoredMessage[];
    try {
      messages = await loadSessionMessages(db, userId, resolved.session.id);
    } catch {
      throw new HttpError(503, "לא הצלחנו לטעון את השיחה.");
    }
    const tasks = await loadTasks(db, userId);
    return Response.json({
      messages,
      tasks,
      session_id: resolved.session.id,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  const started = Date.now();
  try {
    const { db, userId } = await authorize(req);
    const parsed = parseChatRequest(await req.json().catch(() => null));
    if (!parsed.ok) throw new HttpError(parsed.status, parsed.error);
    const { message, surface, session_id: requestedSession } = parsed.request;

    let sessionId = requestedSession;
    if (sessionId) {
      if (!(await ownChatSession(db, userId, sessionId))) {
        throw new HttpError(403, "שיחת היעד אינה שייכת לחשבון הזה.");
      }
    } else {
      const session = await latestOrCreateChatSession(db, userId);
      if (!session) throw new HttpError(503, "לא הצלחנו לפתוח שיחה.");
      sessionId = session.id;
    }

    const { error: userSaveError } = await db.from("chat_messages").insert({
      user_id: userId,
      session_id: sessionId,
      role: "user",
      content: message,
    });
    if (userSaveError) throw new HttpError(503, "לא הצלחנו לשמור את ההודעה.");

    const { data: recent, error: historyError } = await db
      .from("chat_messages")
      .select("role,content,created_at")
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(24);
    if (historyError)
      throw new HttpError(503, "לא הצלחנו לטעון את ההקשר לשיחה.");

    const [tasks, memory] = await Promise.all([
      loadTasks(db, userId),
      loadMemory(db, userId),
    ]);
    const consequences = await loadConsequences(
      db,
      userId,
      tasks.filter((task) => task.status === "open").map((task) => task.id),
    );

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new HttpError(503, "חיבור ה-AI עדיין לא הוגדר.");
    const model = process.env.OPENAI_MODEL?.trim() || "gpt-5.6-luna";

    const openaiInput = (recent ?? [])
      .slice()
      .reverse()
      .map((item, index, items) => {
        const isCurrentUserTurn =
          index === items.length - 1 && item.role === "user";
        const hint = isCurrentUserTurn ? surfaceInputHint(surface) : "";
        return { role: item.role, content: `${hint}${item.content}` };
      });

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model,
        store: false,
        instructions: buildInstructions({
          tasks,
          memory,
          consequences,
          surface,
        }),
        input: openaiInput,
        max_output_tokens: 1400,
        text: {
          format: {
            type: "json_schema",
            name: "agent_turn",
            strict: true,
            schema: AGENT_TURN_JSON_SCHEMA,
          },
        },
      }),
    });

    const raw = await response.text();
    const latencyMs = Date.now() - started;

    if (!response.ok) {
      await trackAi(userId, "ai.failure", {
        status: response.status,
        latencyMs,
        code: response.status === 429 ? "rate_limited" : "upstream_error",
      });
      console.error("OpenAI Lean chat upstream error", {
        status: response.status,
        model,
      });
      if (response.status === 429)
        throw new HttpError(503, "הסוכן עמוס כרגע. אפשר לנסות שוב בעוד רגע.");
      throw new HttpError(502, "לא הצלחנו לקבל תשובה מהסוכן.");
    }

    let data: OpenAIResponse;
    try {
      data = JSON.parse(raw) as OpenAIResponse;
    } catch {
      await trackAi(userId, "ai.failure", {
        latencyMs,
        code: "invalid_json",
      });
      throw new HttpError(502, "הסוכן החזיר תשובה לא תקינה.");
    }

    const extracted = extractText(data);
    if (!extracted) {
      await trackAi(userId, "ai.failure", { latencyMs, code: "empty" });
      throw new HttpError(502, "הסוכן לא החזיר תשובה.");
    }

    const decision = parseDecision(extracted);
    if (!decision.ok) {
      await trackAi(userId, "ai.failure", { latencyMs, code: "parse" });
      throw new HttpError(502, "הסוכן החזיר תשובה לא תקינה.");
    }
    const scoped = applySurfaceTurnPolicy({
      surface,
      actions: decision.actions,
      presentation: decision.presentation,
      consequence_updates: decision.consequence_updates,
    });
    const results = await runRequestedActions(db, userId, scoped.actions);
    await persistConsequenceUpdates(db, userId, scoped.consequence_updates);
    const nextTasks = await loadTasks(db, userId);
    const presentation = resolveAgentPresentation(
      scoped.presentation,
      nextTasks,
      new Date(),
      surface,
    );
    const reply = replyForPresentation(
      composeReply(decision.reply, results),
      presentation,
    );
    if (!reply) throw new HttpError(502, "הסוכן לא החזיר תשובה.");

    const { data: saved, error: assistantSaveError } = await db
      .from("chat_messages")
      .insert({
        user_id: userId,
        session_id: sessionId,
        role: "assistant",
        content: reply,
      })
      .select("id,created_at")
      .single();
    if (assistantSaveError || !saved) {
      throw new HttpError(
        503,
        "קיבלנו תשובה מהסוכן אבל לא הצלחנו לשמור אותה. אפשר לנסות שוב.",
      );
    }

    await trackAi(userId, "ai.success", { latencyMs });
    return Response.json({
      reply,
      id: saved.id,
      created_at: saved.created_at,
      tasks: nextTasks,
      presentation,
      session_id: sessionId,
    });
  } catch (error) {
    return jsonError(error);
  }
}
