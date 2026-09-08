import { z } from "zod";
import { authorize, fail, jsonBody, activity, ApiError } from "@/lib/server";
import { ActionBatch } from "@/lib/model";
import { approvePendingProposal } from "@/lib/server/proposals";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { db, userId } = await authorize(req);
    const body = z
      .object({
        proposalId: z.string().uuid(),
        actions: ActionBatch.optional(),
        idempotencyKey: z.string().uuid(),
      })
      .parse(await jsonBody(req, 50_000));

    const result = await approvePendingProposal(db, {
      userId,
      proposalId: body.proposalId,
      actions: body.actions,
      idempotencyKey: body.idempotencyKey,
    });

    await activity(userId, "proposal.approved", {
      requestId,
      proposalId: body.proposalId,
      applied: result.appliedActions.length,
      skipped: result.skippedDuplicates.length,
      rejected: result.rejectedActions.length,
      alreadyApplied: result.alreadyApplied,
    });

    return Response.json(
      {
        state: result.state,
        revision: result.revision,
        proposalStatus: result.proposalStatus,
        appliedActions: result.appliedActions,
        skippedDuplicates: result.skippedDuplicates,
        rejectedActions: result.rejectedActions,
        notice: result.notice,
        alreadyApplied: result.alreadyApplied,
        requestId,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof ApiError) return fail(e, requestId);
    return fail(e, requestId);
  }
}
