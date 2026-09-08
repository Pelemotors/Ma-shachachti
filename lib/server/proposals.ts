import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { Action, ActionBatch, AppState, StateSchema } from "@/lib/model";
import { applyActions, activeDailyPlan } from "@/lib/engine";
import {
  classifyTaskDuplicate,
  isHardDuplicate,
} from "@/lib/domain/tasks/dedupe";
import { syncDailyPlanAfterActions } from "@/lib/domain/planning/sync-daily-plan";
import {
  buildApproveTaskNotice,
  countPlannedCreates,
  resolveRequestedTodayTaskIds,
  stampTaskCreateIds,
} from "@/lib/domain/planning/plan-intent";
import { ApiError } from "./errors";
import { readState } from "./state-store";

export const ProposalPayloadSchema = z.object({
  summary: z.string().min(1).max(800),
  proposedActions: ActionBatch,
  similarHints: z
    .array(
      z.object({
        title: z.string(),
        existingTitle: z.string(),
      }),
    )
    .max(20)
    .optional(),
  affectsToday: z.boolean().default(false),
  requestedTodayTaskIds: z.array(z.string().uuid()).default([]),
});

export type ProposalPayload = z.infer<typeof ProposalPayloadSchema>;

export const PROPOSAL_TYPES = [
  "plan",
  "shopping",
  "complex",
  "replan",
  "tasks",
  "other",
] as const;

export type ProposalType = (typeof PROPOSAL_TYPES)[number];

export async function createPendingProposal(
  db: SupabaseClient,
  input: {
    userId: string;
    type: ProposalType;
    turnId: string | null;
    sourceRevision: number;
    payload: ProposalPayload;
    expiresAt?: string;
  },
) {
  const payload = ProposalPayloadSchema.parse({
    ...input.payload,
    proposedActions: stampTaskCreateIds(input.payload.proposedActions),
  });
  const requestedTodayTaskIds = resolveRequestedTodayTaskIds({
    actions: payload.proposedActions,
    affectsToday: payload.affectsToday,
    existingIds: payload.requestedTodayTaskIds,
  });
  const stampedPayload: ProposalPayload = {
    ...payload,
    requestedTodayTaskIds,
  };
  const expiresAt =
    input.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("pending_proposals")
    .insert({
      owner_id: input.userId,
      turn_id: input.turnId,
      type: input.type,
      payload: stampedPayload,
      source_revision: input.sourceRevision,
      status: "pending",
      expires_at: expiresAt,
    })
    .select("*")
    .single();
  if (error || !data)
    throw new ApiError(503, "לא ניתן לשמור הצעה.", "proposals_write_failed");
  return data as {
    id: string;
    type: string;
    payload: ProposalPayload;
    source_revision: number;
    status: string;
    turn_id: string | null;
    expires_at: string;
  };
}

export function revalidateProposalActions(
  state: AppState,
  actions: Action[],
): {
  applicable: Action[];
  skippedDuplicates: Action[];
  rejected: { action: Action; reason: string }[];
  similarHints: { title: string; existingTitle: string }[];
} {
  const applicable: Action[] = [];
  const skippedDuplicates: Action[] = [];
  const rejected: { action: Action; reason: string }[] = [];
  const similarHints: { title: string; existingTitle: string }[] = [];
  let working = state;

  for (const action of actions) {
    if (action.type === "task.create") {
      const match = classifyTaskDuplicate(working, {
        title: action.task.title,
        kind: action.task.kind,
        categoryId: action.task.categoryId,
        detailTypeId: action.task.detailTypeId,
        templateId: action.task.templateId,
        dueAt: action.task.dueAt,
        homeAreaIds: action.task.homeAreaIds,
        relatedMemberIds: action.task.relatedMemberIds,
      });
      if (isHardDuplicate(match)) {
        skippedDuplicates.push(action);
        continue;
      }
      if (match.confidence === "similar") {
        similarHints.push({
          title: action.task.title,
          existingTitle: match.task.title,
        });
      }
    }
    try {
      working = applyActions(working, [action], new Date(), true);
      applicable.push(action);
    } catch (e) {
      rejected.push({
        action,
        reason: e instanceof Error ? e.message : "invalid_action",
      });
    }
  }
  return { applicable, skippedDuplicates, rejected, similarHints };
}

export async function approvePendingProposal(
  db: SupabaseClient,
  input: {
    userId: string;
    proposalId: string;
    actions?: Action[];
    idempotencyKey: string;
  },
) {
  const { data: prop, error: readError } = await db
    .from("pending_proposals")
    .select("*")
    .eq("id", input.proposalId)
    .eq("owner_id", input.userId)
    .maybeSingle();
  if (readError)
    throw new ApiError(503, "לא ניתן לקרוא הצעה.", "proposals_read_failed");
  if (!prop) throw new ApiError(404, "ההצעה לא נמצאה.", "proposal_not_found");

  if (prop.status === "accepted" || prop.status === "partial") {
    const { state, revision } = await readState(db, input.userId);
    return {
      state,
      revision,
      proposalStatus: prop.status as "accepted" | "partial",
      appliedActions: [] as Action[],
      skippedDuplicates: [] as Action[],
      rejectedActions: [] as { action: Action; reason: string }[],
      alreadyApplied: true,
      notice: "ההצעה כבר אושרה קודם.",
    };
  }

  if (prop.status !== "pending")
    throw new ApiError(
      409,
      "ההצעה אינה ממתינה לאישור.",
      "proposal_not_pending",
    );
  if (new Date(prop.expires_at).getTime() <= Date.now()) {
    await db
      .from("pending_proposals")
      .update({ status: "expired" })
      .eq("id", prop.id)
      .eq("owner_id", input.userId);
    throw new ApiError(409, "פג תוקף ההצעה.", "proposal_expired");
  }

  const payload = ProposalPayloadSchema.parse(prop.payload);
  const selected = input.actions
    ? ActionBatch.parse(input.actions)
    : payload.proposedActions;

  const { state, revision } = await readState(db, input.userId);
  const { applicable, skippedDuplicates, rejected } = revalidateProposalActions(
    state,
    selected,
  );

  if (!applicable.length && !skippedDuplicates.length) {
    throw new ApiError(
      400,
      "אין פעולות תקפות לאישור מול המצב העדכני.",
      "proposal_empty_after_revalidate",
    );
  }

  const nextApplied =
    applicable.length > 0
      ? applyActions(state, applicable, new Date(), true)
      : state;
  const synced = syncDailyPlanAfterActions({
    state: nextApplied,
    actions: applicable,
    affectsToday: payload.affectsToday,
    requestedTodayTaskIds: payload.requestedTodayTaskIds,
    authorizeBroadReplan:
      payload.affectsToday && payload.requestedTodayTaskIds.length > 0,
    now: new Date(),
    revision,
  });
  const next = synced.state;
  const requestHash = createHash("sha256")
    .update(
      JSON.stringify({
        proposalId: input.proposalId,
        actions: applicable,
      }),
    )
    .digest("hex");

  const proposalStatus =
    rejected.length || skippedDuplicates.length ? "partial" : "accepted";

  const { data: saved, error: saveError } = await db.rpc(
    "approve_pending_proposal_save",
    {
      p_proposal_id: prop.id,
      p_owner_id: input.userId,
      p_new_status: proposalStatus,
      p_payload: {
        ...payload,
        proposedActions: selected,
      },
      p_data: StateSchema.parse(next),
      p_expected_revision: revision,
      p_key: input.idempotencyKey,
      p_request_hash: requestHash,
    },
  );
  if (saveError) {
    if (saveError.message.includes("revision_conflict"))
      throw new ApiError(
        409,
        "המידע השתנה בחלון אחר. טענו מחדש לפני אישור.",
        "revision_conflict",
      );
    if (saveError.message.includes("idempotency_conflict"))
      throw new ApiError(
        409,
        "מזהה אישור כבר שייך לפעולה אחרת.",
        "action_idempotency_conflict",
      );
    if (saveError.message.includes("proposal_not_pending"))
      throw new ApiError(
        409,
        "ההצעה אינה ממתינה לאישור.",
        "proposal_not_pending",
      );
    if (saveError.message.includes("proposal_not_found"))
      throw new ApiError(404, "ההצעה לא נמצאה.", "proposal_not_found");
    throw new ApiError(503, "השמירה לא הצליחה.", "state_save_failed");
  }

  const alreadyApplied = Boolean(saved?.alreadyApplied);
  const finalState = StateSchema.parse(saved.state);
  const appliedCount = applicable.filter(
    (a) => a.type === "task.create",
  ).length;
  const skippedCount = skippedDuplicates.filter(
    (a) => a.type === "task.create",
  ).length;
  const plan = activeDailyPlan(finalState);
  const beforeIds = new Set(state.tasks.map((t) => t.id));
  const newTaskIds = finalState.tasks
    .filter((t) => !beforeIds.has(t.id))
    .map((t) => t.id);
  const plannedCreates = countPlannedCreates(newTaskIds, plan?.items);
  const todayIntent = Boolean(
    payload.affectsToday || payload.requestedTodayTaskIds.length,
  );
  const notice = buildApproveTaskNotice({
    appliedCount,
    skippedCount,
    todayIntent,
    plannedCreates,
    planSyncFailed: synced.planSyncFailed,
    requiresProposal: synced.requiresProposal,
    syncedNotice: synced.notice,
  });

  return {
    state: finalState,
    revision: Number(saved.revision),
    proposalStatus: (saved.proposalStatus ?? proposalStatus) as
      "accepted" | "partial",
    appliedActions: applicable,
    skippedDuplicates,
    rejectedActions: rejected,
    alreadyApplied,
    notice,
  };
}

export async function declinePendingProposal(
  db: SupabaseClient,
  userId: string,
  proposalId: string,
) {
  const { data, error } = await db
    .from("pending_proposals")
    .update({ status: "declined" })
    .eq("id", proposalId)
    .eq("owner_id", userId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (error)
    throw new ApiError(503, "לא ניתן לבטל הצעה.", "proposals_update_failed");
  if (!data) throw new ApiError(404, "ההצעה לא נמצאה.", "proposal_not_found");
  return data;
}
