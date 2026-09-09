/**
 * AUDIT HISTORY ONLY for Personal Agent Guide revisions.
 *
 * - Not a Source of Truth for the active guide.
 * - Runtime / Agent context MUST NEVER read the current guide from this table.
 * - Active guide SoT: `app_states.data.personalAgentGuide`.
 * - Append is best-effort after AppState persistence succeeds; failure here
 *   must not roll back or redefine the active guide.
 *
 * Reliable full-history rollback cannot depend on best-effort alone — see
 * product decision notes; do not promote this table to SoT without a
 * transactional write path.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PersonalAgentGuideRevisionEntry } from "@/lib/domain/agent-guide";
import { ApiError } from "./errors";

/** Append-only audit row. Does not define or replace the active guide. */
export async function appendPersonalAgentGuideRevision(
  db: SupabaseClient,
  ownerId: string,
  entry: PersonalAgentGuideRevisionEntry,
) {
  const { error } = await db.from("personal_agent_guide_revisions").insert({
    owner_id: ownerId,
    revision: entry.revision,
    previous_revision: entry.previousRevision,
    text: entry.text,
    source_turn_id: entry.sourceTurnId,
    proposal_id: entry.proposalId,
    created_at: entry.createdAt,
  });
  if (error) {
    throw new ApiError(
      503,
      "שמירת היסטוריית מדריך הסוכן נכשלה.",
      "agent_guide_history_failed",
    );
  }
}
