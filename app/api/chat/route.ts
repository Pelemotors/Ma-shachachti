import { authorize, HttpError } from "@/lib/server-auth";
import { composeReply, inspectActions } from "@/lib/action-schema";
import { loadMemory, loadTasks } from "@/lib/actions";
import { loadConsequences, persistConsequenceUpdates } from "@/lib/consequences";
import {
  applySurfaceTurnPolicy,
  buildInstructions,
  surfaceInputHint,
} from "@/lib/agent/turn";
import {
  AgentUpstreamError,
  requestAgentDecision,
} from "@/lib/agent/openai-orchestrator";
import {
  claimAgentTurn,
  completeAgentTurn,
  failAgentTurn,
  saveAgentTurnDecision,
} from "@/lib/agent/turn-receipts";
import { executeIdempotentActions } from "@/lib/agent/idempotent-actions";
import {
  parseStoredDecision,
  storeValidatedDecision,
} from "@/lib/agent/stored-decision";
import { recordActivity } from "@/lib/activity";
import { parseChatRequest } from "@/lib/chat-request";
import {
  latestOrCreateChatSession,
  loadSessionMessages,
  ownChatSession,
  persistTurnMessage,
  resolveReadableChatSession,
} from "@/lib/chat-sessions";
import {
  replyForPresentation,
  resolveAgentPresentation,
} from "@/lib/presentation";
import { createAgentProposal } from "@/lib/proposals";
import { createServiceClient } from "@/lib/supabase-admin";
import { validateStoredPresentation } from "@/lib/chat-presentation";
import { loadAgentProfile } from "@/lib/user-profile";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;

type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof AgentUpstreamError) {
    if (error.code === "rate_limited") {
      return Response.json(
        { error: "הסוכן עמוס כרגע. אפשר לנסות שוב בעוד רגע." },
        { status: 503 },
      );
    }
    return Response.json(
      { error: "לא הצלחנו לקבל תשובה תקינה מהסוכן." },
      { status: 502 },
    );
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
  let activeTurn: {
    db: SupabaseClient;
    userId: string;
    id: string;
    resumable: boolean;
  } | null = null;
  try {
    const { db, userId } = await authorize(req);
    const parsed = parseChatRequest(await req.json().catch(() => null));
    if (!parsed.ok) throw new HttpError(parsed.status, parsed.error);
    const {
      message,
      surface,
      surface_context: surfaceContext,
      session_id: requestedSession,
      turn_id: turnKey,
    } = parsed.request;

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

    const turnClaim = await claimAgentTurn(db, {
      userId,
      sessionId,
      turnKey,
    });
    if (turnClaim.kind === "completed") {
      return Response.json(turnClaim.response);
    }
    if (turnClaim.kind === "processing") {
      throw new HttpError(409, "הפנייה הזו עדיין בטיפול.");
    }
    activeTurn = {
      db,
      userId,
      id: turnClaim.id,
      resumable: Boolean(turnClaim.decision),
    };

    const tasks = await loadTasks(db, userId);
    let agent = parseStoredDecision(turnClaim.decision);
    if (turnClaim.decision && !agent) {
      throw new Error("invalid_stored_turn_decision");
    }
    if (!agent) {
      const { data: recent, error: historyError } = await db
        .from("chat_messages")
        .select("role,content,created_at")
        .eq("user_id", userId)
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(24);
      if (historyError)
        throw new HttpError(503, "לא הצלחנו לטעון את ההקשר לשיחה.");

      const [memory, consequences, profile] = await Promise.all([
          loadMemory(db, userId),
          loadConsequences(
            db,
            userId,
            tasks.filter((task) => task.status === "open").map((task) => task.id),
          ),
          loadAgentProfile(db, userId),
        ]).catch(() => {
          throw new HttpError(503, "לא הצלחנו לטעון את הקשר המשתמש לשיחה.");
        });
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new HttpError(503, "חיבור ה-AI עדיין לא הוגדר.");
      const model = process.env.OPENAI_MODEL?.trim() || "gpt-5.6-luna";
      const openaiInput = (recent ?? [])
        .slice()
        .reverse()
        .map((item) => ({ role: item.role, content: item.content }));
      openaiInput.push({
        role: "user",
        content: `${surfaceInputHint(surface, surfaceContext)}${message}`,
      });

      const requested = await requestAgentDecision({
        apiKey,
        model,
        instructions: buildInstructions({
          tasks,
          memory,
          profile,
          consequences,
          surface,
          surfaceContext,
        }),
        messages: openaiInput,
      });
      const stored = await saveAgentTurnDecision(
        db,
        userId,
        turnClaim.id,
        storeValidatedDecision(requested),
      );
      activeTurn.resumable = true;
      agent = parseStoredDecision(stored);
      if (!agent) throw new Error("invalid_saved_turn_decision");
    }

    const latencyMs = Date.now() - started;
    const decision = agent.decision;
    const scoped = decision
      ? applySurfaceTurnPolicy({
          surface,
          actions: decision.actions,
          presentation: decision.presentation,
          consequence_updates: decision.consequence_updates,
        })
      : { actions: [], presentation: null, consequence_updates: [] };

    await persistTurnMessage(db, {
      userId,
      sessionId,
      turnId: turnClaim.id,
      role: "user",
      content: message,
    });

    // No capability mutation is reachable before a complete, validated decision.
    const inspected = inspectActions(scoped.actions);
    if (inspected.results.length > 0) {
      throw new Error("invalid_scoped_actions");
    }
    const results = decision
      ? await executeIdempotentActions(db, {
          scope: "turn",
          scopeId: turnClaim.id,
          actions: inspected.accepted,
        })
      : [];
    if (decision) {
      await persistConsequenceUpdates(
        db,
        userId,
        scoped.consequence_updates,
      );
    }
    const nextTasks = await loadTasks(db, userId);
    const presentation = resolveAgentPresentation(
      scoped.presentation,
      nextTasks,
      new Date(),
      surface,
    );
    const storedPresentation = validateStoredPresentation(presentation);
    const proposalRecord =
      decision?.proposal != null
        ? await createAgentProposal(db, {
            userId,
            sessionId,
            turnId: turnClaim.id,
            proposal: decision.proposal,
          })
        : null;
    const proposal = proposalRecord
      ? { ...proposalRecord, result_reply: null }
      : null;
    const reply = replyForPresentation(
      decision
        ? composeReply(decision.reply, results)
        : (agent.recoveredReply ?? ""),
      presentation,
    );
    if (!reply) throw new HttpError(502, "הסוכן לא החזיר תשובה.");

    const saved = await persistTurnMessage(db, {
      userId,
      sessionId,
      turnId: turnClaim.id,
      role: "assistant",
      content: reply,
      presentation: storedPresentation,
    });

    const responseBody = {
      reply,
      id: saved.id,
      created_at: saved.created_at,
      tasks: nextTasks,
      presentation: storedPresentation,
      proposal,
      session_id: sessionId,
      turn_id: turnKey,
    };
    await completeAgentTurn(db, userId, turnClaim.id, responseBody);
    activeTurn = null;
    await trackAi(userId, "ai.success", {
      latencyMs,
      attempts: agent.attempts,
      recovered: Boolean(agent.recoveredReply),
    });
    return Response.json(responseBody);
  } catch (error) {
    if (activeTurn && !activeTurn.resumable) {
      await failAgentTurn(
        activeTurn.db,
        activeTurn.userId,
        activeTurn.id,
      ).catch(() => undefined);
    }
    return jsonError(error);
  }
}
