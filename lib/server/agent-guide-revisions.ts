/**
 * Optional durable append of Personal Agent Guide revision after successful
 * AppState persistence. Failures must not be treated as guide success by callers.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PersonalAgentGuideRevisionEntry } from "@/lib/domain/agent-guide";
import { ApiError } from "./errors";

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
