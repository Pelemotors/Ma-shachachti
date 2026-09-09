import { createHash } from "node:crypto";
import { z } from "zod";
import {
  authorize,
  readState,
  loadStateForTurn,
  rememberSavedState,
  budget,
  fail,
  ApiError,
  jsonBody,
  activity,
} from "@/lib/server";
import { orchestrateChatTurn } from "@/lib/agent/orchestration";
import { applyActions } from "@/lib/engine";
import { StateSchema, type Action, type AppState } from "@/lib/model";
import {
  claimChatReceipt,
  completeChatReceipt,
} from "@/lib/server/chat-receipts";
import {
  approvePendingProposal,
  createPendingProposal,
  declinePendingProposal,
  getLatestPendingProposal,
  revalidateProposalActions,
} from "@/lib/server/proposals";
import { summarizeContextTrace } from "@/lib/agent/context-instrumentation";
import { syncDailyPlanAfterActions } from "@/lib/domain/planning/sync-daily-plan";
import {
  appendExecutionReceipt,
  buildExecutionReceipt,
} from "@/lib/domain/execution-receipts";
import { lastCompactedCursor } from "@/lib/domain/memory/compaction";
import {
  resolveRequestedTodayTaskIds,
  stampScheduleCreateRefs,
} from "@/lib/domain/planning/plan-intent";
import { buildGroundedProposalSummary } from "@/lib/domain/agent-context";
import { AGENT_CONTRACT_VERSION } from "@/lib/agent/instructions";
import { composeAssistantText } from "@/lib/agent/execution-truth";
import { CHAT_API_SUPPORTED, CHAT_API_VERSION } from "@/lib/version";

export const runtime = "nodejs";
export const maxDuration = 60;

function deploymentVersion() {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.DEPLOYMENT_VERSION ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    "dev"
  );
}

async function saveTurnState(
  db: Awaited<ReturnType<typeof authorize>>["db"],
  input: {
    userId: string;
    state: AppState;
    revision: number;
    actions: Action[];
    affectsToday: boolean;
    requestedTodayTaskIds?: string[];
    idempotencyKey: string;
    requestHash: string;
  },
) {
  let working = applyActions(input.state, input.actions, new Date(), false);
  const synced = syncDailyPlanAfterActions({
    state: working,
    actions: input.actions,
    affectsToday: input.affectsToday,
    requestedTodayTaskIds: input.requestedTodayTaskIds,
    now: new Date(),
    revision: input.revision,
  });
  working = synced.state;
  const persisted = input.actions.filter(
    (action) =>
      action.type !== "message.add" && action.type !== "operation.record",
  );
  if (persisted.length) {
    working = appendExecutionReceipt(
      working,
      buildExecutionReceipt({
        turnId: input.idempotencyKey,
        resolvedAt: new Date().toISOString(),
        actions: persisted,
      }),
    );
  }

  const { data: saved, error: saveError } = await db.rpc(
    "idempotent_save_app_state",
    {
      p_data: StateSchema.parse(working),
      p_expected_revision: input.revision,
      p_key: input.idempotencyKey,
      p_request_hash: input.requestHash,
    },
  );
  if (saveError) {
    if (saveError.message.includes("revision_conflict")) {
      const latest = await readState(db, input.userId);
      rememberSavedState(input.userId, latest.revision, latest.state);
      let simulated = latest.state;
      try {
        for (const action of input.actions) {
          simulated = applyActions(simulated, [action], new Date(), false);
        }
      } catch {
        throw new ApiError(
          409,
          "המידע השתנה בזמן השיחה. אפשר לשלוח שוב כדי שאעדכן לפי המצב החדש.",
          "revision_conflict",
        );
      }

      let retryState = simulated;
      const retrySync = syncDailyPlanAfterActions({
        state: retryState,
        actions: input.actions,
        affectsToday: input.affectsToday,
        requestedTodayTaskIds: input.requestedTodayTaskIds,
        now: new Date(),
        revision: latest.revision,
      });
      retryState = retrySync.state;
      if (persisted.length) {
        retryState = appendExecutionReceipt(
          retryState,
          buildExecutionReceipt({
            turnId: input.idempotencyKey,
            resolvedAt: new Date().toISOString(),
            actions: persisted,
          }),
        );
      }
      const { data: saved2, error: saveError2 } = await db.rpc(
        "idempotent_save_app_state",
        {
          p_data: StateSchema.parse(retryState),
          p_expected_revision: latest.revision,
          p_key: input.idempotencyKey,
          p_request_hash: input.requestHash,
        },
      );
      if (saveError2) {
        if (saveError2.message.includes("revision_conflict"))
          throw new ApiError(
            409,
            "המידע השתנה בזמן השיחה. אפשר לשלוח שוב.",
            "revision_conflict",
          );
        throw new ApiError(503, "שמירת תור השיחה נכשלה.", "state_save_failed");
      }
      const recovered = StateSchema.parse(saved2.state);
      const recoveredRevision = Number(saved2.revision);
      rememberSavedState(input.userId, recoveredRevision, recovered);
      return {
        state: recovered,
        revision: recoveredRevision,
        planSyncFailed: retrySync.planSyncFailed,
        planNotice: retrySync.notice,
      };
    }
    throw new ApiError(503, "שמירת תור השיחה נכשלה.", "state_save_failed");
  }
  const nextState = StateSchema.parse(saved.state);
  const nextRevision = Number(saved.revision);
  rememberSavedState(input.userId, nextRevision, nextState);
  return {
    state: nextState,
    revision: nextRevision,
    planSyncFailed: synced.planSyncFailed,
    planNotice: synced.notice,
  };
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const started = Date.now();
  let ownerId: string | null = null;
  let stage = "authorize";
  let turnId = "";
  let stateRevision = 0;
  let selectedModel = "";
  let claimed = false;
  let idempotencyKey = "";
  let requestHash = "";
  let dbRef: Awaited<ReturnType<typeof authorize>>["db"] | null = null;
  try {
    const { db, userId } = await authorize(req);
    dbRef = db;
    ownerId = userId;
    const clientChatApi = req.headers.get("x-chat-api-version");
    if (clientChatApi != null && clientChatApi !== "") {
      const v = Number(clientChatApi);
      if (
        !Number.isInteger(v) ||
        !(CHAT_API_SUPPORTED as readonly number[]).includes(v)
      ) {
        throw new ApiError(
          409,
          "צריך לרענן את האפליקציה כדי להמשיך.",
          "client_upgrade_required",
        );
      }
    }

    const body = z
      .object({
        message: z.string().trim().max(6000).optional().default(""),
        contextTaskId: z.string().uuid().nullable().optional(),
        idempotencyKey: z.string().uuid(),
        turnId: z.string().uuid().optional(),
        surface: z.enum(["chat", "memory", "planning"]).optional(),
        selectedDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        manualPlacementTaskId: z.string().uuid().optional(),
        scheduleIntent: z.enum(["build", "realign", "changed-day"]).optional(),
        availableMinutes: z.number().int().min(1).max(24 * 60).optional(),
        effort: z.number().int().min(1).max(3).optional(),
        memoryContext: z
          .object({
            requestedLifetime: z.enum(["stable", "temporary"]).optional(),
            expiresAt: z
              .string()
              .datetime({ offset: true })
              .nullable()
              .optional(),
          })
          .optional(),
      })
      .refine(
        (value) =>
          Boolean(value.message) ||
          Boolean(value.scheduleIntent) ||
          value.surface === "memory",
        { message: "message_or_surface_required" },
      )
      .parse(await jsonBody(req, 20_000));
    turnId = body.turnId ?? body.idempotencyKey;
    idempotencyKey = body.idempotencyKey;
    requestHash = createHash("sha256")
      .update(
        JSON.stringify({
          message: body.message,
          contextTaskId: body.contextTaskId ?? null,
          turnId,
          surface: body.surface ?? "chat",
          selectedDate: body.selectedDate ?? null,
          manualPlacementTaskId: body.manualPlacementTaskId ?? null,
          scheduleIntent: body.scheduleIntent ?? null,
          availableMinutes: body.availableMinutes ?? null,
          effort: body.effort ?? null,
          memoryContext: body.memoryContext ?? null,
        }),
      )
      .digest("hex");

    stage = "claim";
    const claim = await claimChatReceipt(db, {
      userId,
      idempotencyKey: body.idempotencyKey,
      requestHash,
    });
    if (claim.outcome === "conflict")
      throw new ApiError(
        409,
        "מזהה ניסיון השיחה כבר שייך להודעה אחרת.",
        "chat_idempotency_conflict",
      );
    if (claim.outcome === "in_progress")
      throw new ApiError(
        409,
        "אותו ניסיון שיחה עדיין בעיבוד. אפשר להמתין רגע ולנסות שוב.",
        "chat_turn_in_progress",
      );
    if (claim.outcome === "replay") {
      return Response.json(claim.response, {
        headers: {
          "Cache-Control": "no-store",
          "X-Idempotent-Replay": "1",
        },
      });
    }
    claimed = true;

    stage = "state_read";
    const loaded = await loadStateForTurn(db, userId);
    const { state, revision } = loaded;
    stateRevision = revision;
    const dbFetches = [...loaded.dbFetches];

    stage = "pending_proposal_read";
    const pending = await getLatestPendingProposal(db, userId);
    if (pending) dbFetches.push("pending_proposals");

    stage = "budget";
    await budget(userId, "chat", Number(process.env.AI_HOURLY_LIMIT) || 30);

    stage = "agent_call";
    const result = await orchestrateChatTurn({
      state,
      revision,
      message: body.message,
      contextTaskId: body.contextTaskId ?? null,
      turnId,
      requestId,
      surface: body.surface ?? "chat",
      selectedDate: body.selectedDate ?? null,
      manualPlacementTaskId: body.manualPlacementTaskId ?? null,
      scheduleIntent: body.scheduleIntent ?? null,
      availableMinutes: body.availableMinutes ?? null,
      effort: body.effort ?? null,
      memoryContext: body.memoryContext ?? null,
      householdId: userId,
      pendingProposal: pending
        ? {
            proposalId: pending.id,
            summary: pending.summary,
            actionTypes: pending.actionTypes,
            actionCount: pending.actionCount,
            sourceRevision: pending.sourceRevision,
            turnId: pending.turnId,
            expiresAt: pending.expiresAt,
          }
        : null,
      dbFetches,
    });
    selectedModel = result.selectedModel;

    stage = "grounding";
    const composed = composeAssistantText({
      modelReply: result.reply,
      clarificationQuestion: result.clarification?.question ?? null,
      proposalPending: Boolean(result.proposal?.proposedActions.length),
      persistedActions: result.explicitActions ?? [],
    });
    const assistantText = composed.text;

    const memoryActions: Action[] = [];
    if (
      result.workingMemoryUpdate != null &&
      typeof result.workingMemoryUpdate === "object"
    ) {
      memoryActions.push({
        type: "workingMemory.patch",
        patch: result.workingMemoryUpdate,
      });
    }

    const typedDecision = result.proposalDecision;
    let workingState = state;
    let workingRevision = revision;
    if (
      typedDecision &&
      pending &&
      typedDecision.proposalId === pending.id
    ) {
      stage = "proposal_decision";
      if (typedDecision.decision === "approve") {
        const approved = await approvePendingProposal(db, {
          userId,
          proposalId: pending.id,
          idempotencyKey: crypto.randomUUID(),
        });
        workingState = approved.state;
        workingRevision = approved.revision;
      } else if (typedDecision.decision === "reject") {
        await declinePendingProposal(db, userId, pending.id);
      }
    }

    const compactionActions: Action[] = [];
    const compactSource = result.compactedMemoryUpdate;
    if (compactSource) {
      const cursor = lastCompactedCursor(workingState);
      compactionActions.push({
        type: "memory.compact",
        facts: compactSource.facts,
        preferences: compactSource.preferences,
        patterns: compactSource.patterns,
        compactedThroughMessageId: cursor.compactedThroughMessageId,
        compactedThroughCreatedAt: cursor.compactedThroughCreatedAt,
      });
    }

    const turnActions: Action[] = [
      ...(body.message
        ? ([
            {
              type: "message.add",
              role: "user",
              text: body.message,
              turnId,
            },
          ] as Action[])
        : []),
      {
        type: "message.add",
        role: "assistant",
        text: assistantText,
        turnId,
      },
      ...(result.explicitActions ?? []),
      ...memoryActions,
      ...compactionActions,
      {
        type: "operation.record",
        turnId,
        summary: result.proposal ? "proposal_pending" : "chat_turn",
        actionTypes: [
          ...(result.explicitActions ?? []).map((a) => a.type),
          ...(result.proposal?.proposedActions.map((a) => a.type) ?? []),
        ],
      },
    ];

    stage = "state_save";
    const saved = await saveTurnState(db, {
      userId,
      state: workingState,
      revision: workingRevision,
      actions: turnActions,
      affectsToday: Boolean(result.affectsToday),
      idempotencyKey: body.idempotencyKey,
      requestHash,
    });
    const nextState = saved.state;
    const nextRevision = saved.revision;
    stateRevision = nextRevision;

    stage = "proposal_persist";
    let proposalId: string | null = null;
    let proposedActions = result.proposal?.proposedActions ?? [];
    let similarHints: { title: string; existingTitle: string }[] = [];
    let proposalSummary = result.proposal?.summary ?? "";
    if (proposedActions.length) {
      const stampedEarly = stampScheduleCreateRefs(proposedActions);
      let requestedTodayTaskIds = resolveRequestedTodayTaskIds({
        actions: stampedEarly,
        affectsToday: Boolean(result.affectsToday),
        requestedTodayCreateIndexes: result.requestedTodayCreateIndexes,
      });
      const revalidated = revalidateProposalActions(nextState, stampedEarly);
      similarHints = revalidated.similarHints;
      proposedActions = revalidated.applicable;
      const remainingIds = new Set(
        proposedActions
          .filter(
            (a): a is Extract<Action, { type: "task.create" }> =>
              a.type === "task.create" && Boolean(a.task.id),
          )
          .map((a) => a.task.id!),
      );
      requestedTodayTaskIds = requestedTodayTaskIds.filter((id) =>
        remainingIds.has(id),
      );
      proposalSummary = buildGroundedProposalSummary(proposedActions);
      if (proposedActions.length) {
        const created = await createPendingProposal(db, {
          userId,
          type: proposedActions.some((a) => a.type === "task.create")
            ? "tasks"
            : "other",
          turnId,
          sourceRevision: nextRevision,
          payload: {
            summary: proposalSummary,
            proposedActions,
            similarHints,
            affectsToday: Boolean(result.affectsToday),
            requestedTodayTaskIds,
          },
        });
        proposalId = created.id;
      }
    }

    const {
      selectedModel: _model,
      instrumentation: _instrumentation,
      ...orch
    } = result;
    const contextTrace = summarizeContextTrace({
      ...result.instrumentation,
      stage: "completed",
      model: selectedModel,
      latencyMs: Date.now() - started,
    });
    const payload = {
      ...orch,
      reply: assistantText,
      explicitActions: result.explicitActions,
      actions: result.explicitActions,
      proposal: proposedActions.length
        ? {
            summary: proposalSummary,
            reason: result.proposal?.reason ?? "other",
            proposedActions,
          }
        : null,
      proposalId,
      similarHints,
      affectsToday: Boolean(result.affectsToday),
      state: nextState,
      revision: nextRevision,
      deploymentVersion: deploymentVersion(),
      agentContractVersion: AGENT_CONTRACT_VERSION,
      chatApiVersion: CHAT_API_VERSION,
      turnId,
      requestId,
      planSyncFailed: saved.planSyncFailed,
      notice: saved.planNotice,
      contextTrace,
    };

    stage = "receipt_save";
    await completeChatReceipt(db, {
      userId,
      idempotencyKey: body.idempotencyKey,
      requestHash,
      response: payload,
      status: "completed",
    });

    await activity(userId, "ai.success", {
      requestId,
      turnId,
      deploymentVersion: deploymentVersion(),
      stage: "complete",
      latencyMs: Date.now() - started,
      model: selectedModel,
      stateRevision: nextRevision,
      actionCount: result.explicitActions.length,
      hasClarification: Boolean(result.clarification),
      hasProposal: Boolean(proposalId),
      rejectedActionCount: result.rejectedActionCount,
      capabilityVersion: contextTrace.capabilityVersion,
      cacheHits: contextTrace.cacheHits,
      cacheMisses: contextTrace.cacheMisses,
      dbFetches: contextTrace.dbFetches,
      deepAccessCount: contextTrace.deepAccessCount,
      pendingProposalIncluded: contextTrace.pendingProposalIncluded,
      contextDomains: contextTrace.contextDomains,
    });
    return Response.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (claimed && ownerId && dbRef && idempotencyKey && requestHash) {
      try {
        await completeChatReceipt(dbRef, {
          userId: ownerId,
          idempotencyKey,
          requestHash,
          response: {
            error: e instanceof ApiError ? e.message : "failed",
            code: e instanceof ApiError ? e.code : "internal_error",
            requestId,
          },
          status: "failed",
        });
      } catch {
        /* best-effort mark failed for reclaim */
      }
    }
    if (ownerId)
      await activity(ownerId, "ai.failure", {
        requestId,
        turnId: turnId || undefined,
        deploymentVersion: deploymentVersion(),
        stage,
        code: e instanceof ApiError ? e.code : "internal_error",
        errorCode: e instanceof ApiError ? e.code : "internal_error",
        latencyMs: Date.now() - started,
        model: selectedModel || undefined,
        stateRevision,
        status: e instanceof ApiError ? e.status : 500,
      });
    return fail(e, requestId);
  }
}
