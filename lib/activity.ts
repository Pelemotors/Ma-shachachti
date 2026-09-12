import type { SupabaseClient } from "@supabase/supabase-js";
import { redactOperationalData } from "./smith/redaction.ts";

export async function recordActivity(
  db: SupabaseClient,
  input: {
    ownerId?: string | null;
    eventType: string;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await db.from("activity_events").insert({
    owner_id: input.ownerId ?? null,
    event_type: input.eventType,
    metadata: redactOperationalData(input.metadata ?? {}),
  });
  if (error) {
    console.error("Lean activity write failed", { type: input.eventType });
  }
}
