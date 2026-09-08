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
import { orchestrateChatTurn } from "@/lib/agent/orchestration";
import { applyActions } from "@/lib/engine";
import { StateSchema, type Action, type AppState } from "@/lib/model";
import {
  claimChatReceipt,
  completeChatReceipt,
} from "@/lib/server/chat-receipts";
import {
  createPendingProposal,
  revalidateProposalActions,
} from "@/lib/server/proposals";
import { syncDailyPlanAfterActions } from "@/lib/domain/planning/sync-daily-plan";
import {
  resolveRequestedTodayTaskIds,
  stampTaskCreateIds,
} from "@/lib/domain/planning/plan-intent";
import { buildGroundedProposalSummary } from "@/lib/domain/agent-context";
import {
  applyAgentPolicySignals,
  type AgentPolicySignal,
} from "@/lib/domain/agent-policy";
import { AGENT_CONTRACT_VERSION } from "@/lib/agent/instructions";
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
    policySignals?: AgentPolicySignal[];
    idempotencyKey: string;
    requestHash: string;
  },
) {
  const learnedState = applyAgentPolicySignals(
    input.state,
    input.policySignals ?? [],
    new Date(),
  );
  let working = applyActions(learnedState, input.actions, new Date(), false);
  const synced = syncDailyPlanAfterActions({
    state: working,
    actions: input.actions,
    affectsToday: input.affectsToday,
    requestedTodayTaskIds: input.requestedTodayTaskIds,
    now: new Date(),
    revision: input.revision,
  });
  working = synced.state;

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
      // R07: re-read latest, revalidate, keep reply path viable.
      // Re-apply policy learning to the latest state exactly once for this turn.
      const latest = await readState(db, input.userId);
      const latestLearned = applyAgentPolicySignals(
        latest.state,
        input.policySignals ?? [],
        new Date(),
      );
      const retryActions: Action[] = [];
      for (const action of input.actions) {
        try {
          applyActions(latestLearned, [action], new Date(), false);
          retryActions.push(action);
        } catch {
          /* drop invalid against latest */
        }
      }
      let retryState = applyActions(
        latestLearned,
        retryActions,
        new Date(),
        false,
      );
      const retrySync = syncDailyPlanAfterActions({
        state: retryState,
        actions: retryActions,
        affectsToday: input.affectsToday,
        requestedTodayTaskIds: input.requestedTodayTaskIds,
        now: new Date(),
        revision: latest.revision,
      });
      retryState = retrySync.state;
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
      return {
        state: StateSchema.parse(saved2.state),
        revision: Number(saved2.revision),
        planSyncFailed: retrySync.planSyncFailed,
        planNotice: retrySync.notice,
      };
    }
    throw new ApiError(503, "שמירת תור השיחה נכשלה.", "state_save_failed");
  }
  return {
    state: StateSchema.parse(saved.state),
    revision: Number(saved.revision),
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
        message: z.string().trim().min(1).max(6000),
        contextTaskId: z.string().uuid().nullable().optional(),
        idempotencyKey: z.string().uuid(),
        turnId: z.string().uuid().optional(),
      })
      .parse(await jsonBody(req, 20_000));
    turnId = body.turnId ?? body.idempotencyKey;
    idempotencyKey = body.idempotencyKey;
    requestHash = createHash("sha256")
      .update(
        JSON.stringify({
          message: body.message,
          contextTaskId: body.contextTaskId ?? null,
          turnId,
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
    const { state, revision } = await readState(db, userId);
    stateRevision = revision;

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
    });
    selectedModel = result.selectedModel;

    stage = "grounding";
    const assistantText =
      result.clarification?.question &&
      !result.reply.includes(result.clarification.question)
        ? `${result.reply}\n\n${result.clarification.question}`
        : result.reply;

    const nowIso = new Date().toISOString();
    const pendingActions: Action[] = [];
    if (result.clarification?.question) {
      const unresolved = result.clarification.unresolvedPart?.trim();
      pendingActions.push({
        type: "pendingIntent.set",
        intent: {
          id: crypto.randomUUID(),
          type: result.proposal?.proposedActions.some(
            (a) => a.type === "task.create",
          )
            ? "task_create"
            : result.explicitActions.some((a) => a.type === "reminder.add") ||
                result.proposal?.proposedActions.some(
                  (a) => a.type === "reminder.add",
                )
              ? "reminder_create"
              : "other",
          draftActions: [
            ...(result.proposal?.proposedActions ?? []),
            ...(result.explicitActions ?? []),
          ].slice(0, 20),
          missingFields: unresolved ? [unresolved.slice(0, 40)] : [],
          clarificationQuestion: result.clarification.question,
          sourceTurnId: turnId,
          contextTaskId: body.contextTaskId ?? null,
          createdAt: nowIso,
          expiresAt: new Date(Date.now() + 2 * 3600_000).toISOString(),
        },
      });
    } else if (state.pendingAgentIntent) {
      pendingActions.push({ type: "pendingIntent.clear" });
    }

    const turnActions: Action[] = [
      {
        type: "message.add",
        role: "user",
        text: body.message,
        turnId,
      },
      {
        type: "message.add",
        role: "assistant",
        text: assistantText,
        turnId,
      },
      ...(result.explicitActions ?? []),
      ...pendingActions,
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
      state,
      revision,
      actions: turnActions,
      affectsToday: Boolean(result.affectsToday),
      policySignals: result.policySignals,
      idempotencyKey: body.idempotencyKey,
      requestHash,
    });
    let nextState = saved.state;
    let nextRevision = saved.revision;
    stateRevision = nextRevision;

    stage = "proposal_persist";
    let proposalId: string | null = null;
    let proposedActions = result.proposal?.proposedActions ?? [];
    let similarHints: { title: string; existingTitle: string }[] = [];
    let proposalSummary = result.proposal?.summary ?? "";
    if (proposedActions.length) {
      // Stamp IDs early so today-intent indexes resolve before filtering drops creates.
      const stampedEarly = stampTaskCreateIds(proposedActions);
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
      policySignals: _policySignals,
      ...orch
    } = result;
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
      policySignalCount: result.policySignals.length,
      rejectedActionCount: result.rejectedActionCount,
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
