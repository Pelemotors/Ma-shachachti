import { adminDb } from "./auth";

export async function activity(
  ownerId: string,
  eventType: string,
  metadata: Record<string, unknown> = {},
) {
  try {
    const { error } = await adminDb()
      .from("activity_events")
      .insert({ owner_id: ownerId, event_type: eventType, metadata });
    if (error) console.error("Activity event write failed", { eventType });
  } catch {
    console.error("Activity event write failed", { eventType });
  }
}
