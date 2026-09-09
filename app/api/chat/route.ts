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
  createPendingProposal,
  getLatestPendingProposal,
  revalidateProposalActions,
} from "@/lib/server/proposals";
import { summarizeContextTrace } from "@/lib/agent/context-instrumentation";
import { syncDailyPlanAfterActions } from "@/lib/domain/planning/sync-daily-plan";
import {
  resolveRequestedTodayTaskIds,
  stampTaskCreateIds,
} from "@/lib/domain/planning/plan-intent";
import { buildGroundedProposalSummary } from "@/lib/domain/agent-context";
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

/**
 * Server-grounded execution acknowledgement. The model's reply is deliberately
 * pre-persistence; only this layer confirms a mutation after the same atomic
 * save path has accepted the actions.
 */
function buildExecutionReceipt(actions: Action[]) {
  if (!actions.length) return "";
  if (actions.length > 1) return "ביצעתי את העדכונים.";
  const action = actions[0]!;
  switch (action.type) {
    case "reminder.add":
      return "התזכורת נוספה.";
    case "reminder.update":
      return "התזכורת עודכנה.";
    case "reminder.cancel":
      return "התזכורת בוטלה.";
    case "shopping.add":
    case "shopping.check":
      return "רשימת הקניות עודכנה.";
    case "checklist.create":
      return "הצ׳קליסט נוצר.";
    case "checklist.update":
    case "checklist.item.add":
    case "checklist.item.update":
    case "checklist.item.remove":
    case "checklist.item.reorder":
    case "checklist.item.toggle":
    case "checklist.reset":
      return "הצ׳קליסט עודכן.";
    case "fact.add":
      return "המידע נשמר.";
    case "fact.update":
      return "המידע עודכן.";
    case "profile.update":
    case "member.upsert":
    case "homeArea.upsert":
      return "פרטי הבית עודכנו.";
    case "routine.create":
      return "השגרה נשמרה.";
    case "routine.update":
    case "routine.pause":
      return "השגרה עודכנה.";
    case "planning.set":
    case "planning.clear":
      return "השינוי להיום נשמר.";
    case "template.exclude":
    case "template.restore":
      return "ההעדפה נשמרה.";
    case "task.update":
    case "task.status":
    case "task.start":
    case "task.defer":
    case "task.deferUntil":
    case "task.step":
      return "המשימה עודכנה.";
    default:
      return "בוצע.";
  }
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
        message: z.string().trim().min(1).max(6000),
        contextTaskId: z.string().uuid().nullable().optional(),
        idempotencyKey: z.string().uuid(),
        turnId: z.string().uuid().optional(),
        surface: z.enum(["chat", "memory", "planning"]).optional(),
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
          surface: body.surface ?? "chat",
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
    const conversationalText =
      result.clarification?.question &&
      !result.reply.includes(result.clarification.question)
        ? `${result.reply}\n\n${result.clarification.question}`
        : result.reply;
    const receipt = buildExecutionReceipt(result.explicitActions ?? []);
    const assistantText = receipt
      ? `${conversationalText}\n\n${receipt}`
      : conversationalText;

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
      ...memoryActions,
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
