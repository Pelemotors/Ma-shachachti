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
import { StateSchema } from "@/lib/model";
import { claimChatReceipt, completeChatReceipt } from "@/lib/server/chat-receipts";
import {
  createPendingProposal,
  revalidateProposalActions,
} from "@/lib/server/proposals";
import { AGENT_CONTRACT_VERSION } from "@/lib/agent/instructions";

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

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const started = Date.now();
  let ownerId: string | null = null;
  let stage = "authorize";
  let turnId = "";
  let stateRevision = 0;
  let selectedModel = "";
  try {
    const { db, userId } = await authorize(req);
    ownerId = userId;
    const body = z
      .object({
        message: z.string().trim().min(1).max(6000),
        contextTaskId: z.string().uuid().nullable().optional(),
        idempotencyKey: z.string().uuid(),
        turnId: z.string().uuid().optional(),
      })
      .parse(await jsonBody(req, 20_000));
    turnId = body.turnId ?? body.idempotencyKey;
    const requestHash = createHash("sha256")
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

    const turnActions = [
      {
        type: "message.add" as const,
        role: "user" as const,
        text: body.message,
        turnId,
      },
      {
        type: "message.add" as const,
        role: "assistant" as const,
        text: assistantText,
        turnId,
      },
      ...(result.explicitActions ?? []),
      {
        type: "operation.record" as const,
        turnId,
        summary: result.proposal ? "proposal_pending" : "chat_turn",
        actionTypes: [
          ...(result.explicitActions ?? []).map((a) => a.type),
          ...(result.proposal?.proposedActions.map((a) => a.type) ?? []),
        ],
      },
    ];

    stage = "action_apply";
    const nextStateDraft = applyActions(state, turnActions, new Date(), false);

    stage = "state_save";
    const { data: saved, error: saveError } = await db.rpc(
      "idempotent_save_app_state",
      {
        p_data: StateSchema.parse(nextStateDraft),
        p_expected_revision: revision,
        p_key: body.idempotencyKey,
        p_request_hash: requestHash,
      },
    );
    if (saveError) {
      if (saveError.message.includes("revision_conflict"))
        throw new ApiError(
          409,
          "המידע השתנה בזמן השיחה. אפשר לשלוח שוב.",
          "revision_conflict",
        );
      throw new ApiError(503, "שמירת תור השיחה נכשלה.", "state_save_failed");
    }
    let nextState = StateSchema.parse(saved.state);
    let nextRevision = Number(saved.revision);
    stateRevision = nextRevision;

    stage = "proposal_persist";
    let proposalId: string | null = null;
    let proposedActions = result.proposal?.proposedActions ?? [];
    let similarHints: { title: string; existingTitle: string }[] = [];
    if (proposedActions.length) {
      const revalidated = revalidateProposalActions(nextState, proposedActions);
      similarHints = revalidated.similarHints;
      proposedActions = revalidated.applicable;
      if (proposedActions.length) {
        const created = await createPendingProposal(db, {
          userId,
          type: proposedActions.some((a) => a.type === "task.create")
            ? "tasks"
            : "other",
          turnId,
          sourceRevision: nextRevision,
          payload: {
            summary:
              result.proposal?.summary ??
              "יש פעולות שדורשות אישור לפני ביצוע.",
            proposedActions,
            similarHints,
          },
        });
        proposalId = created.id;
      }
    }

    const { selectedModel: _model, ...orch } = result;
    const payload = {
      ...orch,
      reply: assistantText,
      explicitActions: result.explicitActions,
      actions: result.explicitActions,
      proposal: proposedActions.length
        ? {
            summary:
              result.proposal?.summary ??
              "יש פעולות שדורשות אישור לפני ביצוע.",
            reason: result.proposal?.reason ?? "other",
            proposedActions,
          }
        : null,
      proposalId,
      similarHints,
      state: nextState,
      revision: nextRevision,
      deploymentVersion: deploymentVersion(),
      agentContractVersion: AGENT_CONTRACT_VERSION,
      turnId,
      requestId,
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
    });
    return Response.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (ownerId)
      await activity(ownerId, "ai.failure", {
        requestId,
        turnId: turnId || undefined,
        deploymentVersion: deploymentVersion(),
        stage,
        errorCode: e instanceof ApiError ? e.code : "internal_error",
        latencyMs: Date.now() - started,
        model: selectedModel || undefined,
        stateRevision,
        status: e instanceof ApiError ? e.status : 500,
      });
    return fail(e, requestId);
  }
}
