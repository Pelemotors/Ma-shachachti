import { authorize, HttpError } from "@/lib/server-auth";
import { composeReply, inspectActions } from "@/lib/action-schema";
import { loadMemory, loadOpenTasksForAgent, loadTasks } from "@/lib/actions";
import { loadConsequences, persistConsequenceUpdates } from "@/lib/consequences";
import {
  applySurfaceTurnPolicy,
  buildTurnPrompt,
  surfaceInputHint,
} from "@/lib/agent/turn";
import { buildCompactContext } from "@/lib/agent/context/compact";
import {
  fulfillContextRequests,
  parseContextRequests,
} from "@/lib/agent/context/deep-access";
import {
  AGENT_TOTAL_DEADLINE_MS,
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
  resolveInsightsPresentation,
} from "@/lib/presentation";
import { createAgentProposal } from "@/lib/proposals";
import { createServiceClient } from "@/lib/supabase-admin";
import { validateStoredPresentation } from "@/lib/chat-presentation";
import { loadAgentProfile } from "@/lib/user-profile";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadChecklists, loadShopping } from "@/lib/lists";
import { todayContext } from "@/lib/time";
import {
  classifyAgentError,
  logAgentFailure,
} from "@/lib/agent/failure";
import { ensureUserReply, DEEP_CHECK_FALLBACK_REPLY } from "@/lib/agent/surface-fallback";
import type { ChatSurface } from "@/lib/home-surfaces";
import {
  expandLearnedFollowUps,
  filterMemoryWritesForException,
  reconcileActions,
} from "@/lib/agent/reconcile";
import {
  normalizeMemoryRelationActions,
  selectLearnedActionRelations,
} from "@/lib/agent/learned-relations";
import {
  findPendingSchedulePresentation,
  isolatePendingScheduleActions,
} from "@/lib/agent/schedule-isolation";
import type { AgentAction, ClientPresentation } from "@/lib/types";
import { DEFAULT_TURN_FLAGS } from "@/lib/agent/turn-flags";

export const runtime = "nodejs";
export const maxDuration = 60;

type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

function jsonError(
  error: unknown,
  meta?: { turnId?: string; mode?: string; latencyMs?: number },
) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof AgentUpstreamError) {
    logAgentFailure({
      category: error.category,
      turnId: meta?.turnId,
      mode: meta?.mode,
      latencyMs: meta?.latencyMs,
      reason: error.code,
    });
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
  logAgentFailure({
    category: classifyAgentError(error),
    turnId: meta?.turnId,
    mode: meta?.mode,
    latencyMs: meta?.latencyMs,
    reason: error instanceof Error ? error.message : "unknown",
  });
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
  let trackedUserId: string | null = null;
  let trackedSurface: ChatSurface | null = null;
  let trackedSessionId: string | null = null;
  let trackedTurnKey: string | null = null;
  let trackedMessage = "";
  let activeTurn: {
    db: SupabaseClient;
    userId: string;
    id: string;
    resumable: boolean;
  } | null = null;
  try {
    const { db, userId } = await authorize(req);
    trackedUserId = userId;
    const parsed = parseChatRequest(await req.json().catch(() => null));
    if (!parsed.ok) throw new HttpError(parsed.status, parsed.error);
    const {
      message,
      surface,
      surface_context: surfaceContext,
      session_id: requestedSession,
      turn_id: turnKey,
    } = parsed.request;
    trackedSurface = surface;
    trackedTurnKey = turnKey;
    trackedMessage = message;

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
    trackedSessionId = sessionId;

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

    const tasks =
      surface === "forgotten" ||
      surface === "focus" ||
      surface === "schedule" ||
      surface === "free-time" ||
      surface === "deep-check"
        ? await loadOpenTasksForAgent(db, userId, 200)
        : await loadTasks(db, userId);
    let agent = parseStoredDecision(turnClaim.decision);
    if (turnClaim.decision && !agent) {
      throw new Error("invalid_stored_turn_decision");
    }
    let llmCalls = 0;
    let deepAccessUsed = false;
    let promptModules: string[] = [];
    let promptChars = 0;
    let memoryCount = 0;
    let turnConsequences: Awaited<ReturnType<typeof loadConsequences>> =
      new Map();

    if (!agent) {
      const [memory, consequences, profile, shopping, checklists] =
        await Promise.all([
          loadMemory(db, userId),
          loadConsequences(
            db,
            userId,
            tasks.filter((task) => task.status === "open").map((task) => task.id),
          ),
          loadAgentProfile(db, userId),
          loadShopping(db, userId),
          loadChecklists(db, userId),
        ]).catch(() => {
          throw new HttpError(503, "לא הצלחנו לטעון את הקשר המשתמש לשיחה.");
        });
      turnConsequences = consequences;

      const compact = buildCompactContext({
        surface,
        surfaceContext,
        profile,
        currentTime: todayContext().currentTime,
        queryHint: message,
        allTasks: tasks,
        allMemory: memory,
        consequences: [...consequences.values()],
        shopping,
        checklists,
      });

      const { data: recent, error: historyError } = await db
        .from("chat_messages")
        .select("role,content,created_at")
        .eq("user_id", userId)
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(compact.historyLimit);
      if (historyError)
        throw new HttpError(503, "לא הצלחנו לטעון את ההקשר לשיחה.");

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new HttpError(503, "חיבור ה-AI עדיין לא הוגדר.");
      const model = process.env.OPENAI_MODEL?.trim() || "gpt-5.6-luna";
      const deadlineAt = Date.now() + AGENT_TOTAL_DEADLINE_MS;
      const openaiInput = (recent ?? [])
        .slice()
        .reverse()
        .map((item) => ({ role: item.role, content: item.content }));
      openaiInput.push({
        role: "user",
        content: `${surfaceInputHint(surface, surfaceContext)}${message}`,
      });

      let prompt = buildTurnPrompt({
        compact,
        surface,
        surfaceContext,
      });
      promptModules = prompt.modules;
      promptChars = prompt.approxChars;
      memoryCount = prompt.memoryCount;

      let requested = await requestAgentDecision({
        apiKey,
        model,
        instructions: prompt.instructions,
        messages: openaiInput,
        deadlineAt,
      });
      llmCalls += requested.attempts;

      const firstDecision = requested.decision;
      const requests = parseContextRequests(
        firstDecision && "context_requests" in firstDecision
          ? firstDecision.context_requests
          : [],
      );
      if (firstDecision?.ok && requests.length > 0) {
        const appendix = await fulfillContextRequests({
          db,
          userId,
          requests,
          alreadyTaskIds: new Set(compact.tasks.map((task) => task.id)),
          alreadyMemoryIds: new Set(compact.memories.map((row) => row.id)),
        });
        if (appendix && deadlineAt - Date.now() >= 5_000) {
          deepAccessUsed = true;
          prompt = buildTurnPrompt({
            compact,
            surface,
            surfaceContext,
            deepAccessAppendix: appendix,
          });
          promptModules = prompt.modules;
          promptChars = prompt.approxChars;
          const second = await requestAgentDecision({
            apiKey,
            model,
            instructions: prompt.instructions,
            messages: [
              ...openaiInput,
              {
                role: "user",
                content:
                  "קיבלת Deep Access. ענה מחדש לפי אותה בקשה עם המידע הנוסף. אל תבקש עוד context_requests.",
              },
            ],
            deadlineAt,
          });
          llmCalls += second.attempts;
          requested = second;
        }
      }

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

    const inspected = inspectActions(scoped.actions);
    if (inspected.results.length > 0) {
      throw new Error("invalid_scoped_actions");
    }

    // Pending unsaved schedule_plan in this session → do not commit plan mutations.
    let pendingSchedule: Extract<
      ClientPresentation,
      { type: "schedule_plan" }
    > | null = null;
    if (surface !== "schedule") {
      const { data: recentPresentations } = await db
        .from("chat_messages")
        .select("presentation")
        .eq("user_id", userId)
        .eq("session_id", sessionId)
        .eq("role", "assistant")
        .order("created_at", { ascending: false })
        .limit(6);
      pendingSchedule = findPendingSchedulePresentation(
        (recentPresentations ?? []).map((row) =>
          validateStoredPresentation(row.presentation),
        ),
      );
    }

    const openTasks = tasks.filter((task) => task.status === "open");
    const shoppingForReconcile =
      surface === null
        ? await loadShopping(db, userId).catch(() => [])
        : [];
    // Memory for relations: reload lightweight if agent path skipped load.
    const memoryForRelations = await loadMemory(db, userId).catch(() => []);
    const relations = selectLearnedActionRelations(memoryForRelations);

    let preparedActions: AgentAction[] = inspected.accepted as AgentAction[];
    const turnFlags =
      decision && "turn_flags" in decision && decision.turn_flags
        ? decision.turn_flags
        : DEFAULT_TURN_FLAGS;
    preparedActions = normalizeMemoryRelationActions(preparedActions);
    preparedActions = filterMemoryWritesForException({
      actions: preparedActions,
      turnFlags,
    });
    preparedActions = expandLearnedFollowUps({
      actions: preparedActions,
      relations: relations.map((row) => ({
        trigger: row.trigger,
        followupTitle: row.followupTitle,
        ordering: row.ordering,
      })),
      openTasks,
      turnFlags,
    });
    preparedActions = reconcileActions({
      actions: preparedActions,
      openTasks,
      shopping: shoppingForReconcile,
      userMessage: message,
    });
    const isolated = isolatePendingScheduleActions({
      actions: preparedActions,
      pendingSchedule,
      tasks,
    });
    preparedActions = isolated.actions;

    const results = decision
      ? await executeIdempotentActions(db, {
          scope: "turn",
          scopeId: turnClaim.id,
          actions: preparedActions,
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
    if (turnConsequences.size === 0 && (surface === "forgotten" || surface === "focus")) {
      turnConsequences = await loadConsequences(
        db,
        userId,
        nextTasks.filter((task) => task.status === "open").map((task) => task.id),
      ).catch(() => new Map());
    }
    let presentation = resolveAgentPresentation(
      scoped.presentation,
      nextTasks,
      new Date(),
      surface,
      [...turnConsequences.values()],
    );
    // Prefer partial valid insights over total failure for deep-check.
    if (surface === "deep-check" && !presentation && scoped.presentation) {
      presentation = resolveInsightsPresentation(scoped.presentation);
      if (!presentation) {
        logAgentFailure({
          category: "invalid_insights",
          turnId: turnKey,
          mode: surface,
          latencyMs: Date.now() - started,
          retryCount: agent.attempts,
        });
      }
    }
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
    const composed = replyForPresentation(
      decision
        ? composeReply(decision.reply, results)
        : (agent.recoveredReply ?? ""),
      presentation,
    );
    const reply = ensureUserReply({
      reply: composed,
      surface,
      presentation,
    });
    if (!reply) {
      // Last-resort guard — should be unreachable after ensureUserReply.
      throw new HttpError(502, "הסוכן לא החזיר תשובה.");
    }

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
      llmCalls,
      deepAccess: deepAccessUsed,
      promptChars,
      memoryCount,
      modules: promptModules,
      surface: surface ?? "chat",
    });
    return Response.json(responseBody);
  } catch (error) {
    // Deep-check: never fail the UI with 502 for empty/invalid model output.
    // Return a honest fallback so the user can retry.
    if (
      trackedSurface === "deep-check" &&
      activeTurn &&
      trackedSessionId &&
      trackedTurnKey &&
      (error instanceof AgentUpstreamError ||
        (error instanceof HttpError && error.status === 502))
    ) {
      logAgentFailure({
        category:
          error instanceof AgentUpstreamError
            ? error.category
            : "empty_output",
        turnId: trackedTurnKey,
        mode: "deep-check",
        latencyMs: Date.now() - started,
        reason: error instanceof Error ? error.message : "fallback",
      });
      try {
        await persistTurnMessage(activeTurn.db, {
          userId: activeTurn.userId,
          sessionId: trackedSessionId,
          turnId: activeTurn.id,
          role: "user",
          content: trackedMessage || "בדוק לעומק",
        }).catch(() => undefined);
        const saved = await persistTurnMessage(activeTurn.db, {
          userId: activeTurn.userId,
          sessionId: trackedSessionId,
          turnId: activeTurn.id,
          role: "assistant",
          content: DEEP_CHECK_FALLBACK_REPLY,
          presentation: null,
        });
        const tasks = await loadTasks(activeTurn.db, activeTurn.userId).catch(
          () => [],
        );
        const responseBody = {
          reply: DEEP_CHECK_FALLBACK_REPLY,
          id: saved.id,
          created_at: saved.created_at,
          tasks,
          presentation: null,
          proposal: null,
          session_id: trackedSessionId,
          turn_id: trackedTurnKey,
          partial: true,
        };
        await completeAgentTurn(
          activeTurn.db,
          activeTurn.userId,
          activeTurn.id,
          responseBody,
        );
        activeTurn = null;
        if (trackedUserId) {
          await trackAi(trackedUserId, "ai.failure", {
            code: "deep_check_fallback",
            latencyMs: Date.now() - started,
          });
        }
        return Response.json(responseBody);
      } catch {
        /* fall through to normal error */
      }
    }
    if (activeTurn && !activeTurn.resumable) {
      await failAgentTurn(
        activeTurn.db,
        activeTurn.userId,
        activeTurn.id,
      ).catch(() => undefined);
    }
    if (trackedUserId && error instanceof AgentUpstreamError) {
      await trackAi(trackedUserId, "ai.failure", {
        code: error.code,
        category: error.category,
        latencyMs: Date.now() - started,
      });
    }
    return jsonError(error, {
      turnId: activeTurn?.id ?? trackedTurnKey ?? undefined,
      mode: trackedSurface ?? "chat",
      latencyMs: Date.now() - started,
    });
  }
}
