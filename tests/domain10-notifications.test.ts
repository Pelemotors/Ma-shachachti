import test from "node:test";
import assert from "node:assert/strict";
import { emptyState } from "../lib/model";
import { evaluateNotificationPolicy } from "../lib/domain/notifications/policy";

const now = new Date("2026-09-08T10:00:00.000+03:00");

test("domain10: quiet hours suppress non-urgent; urgent still immediate", () => {
  const profile = { ...emptyState().profile, quietStart: 9, quietEnd: 11 };
  const rem = {
    id: crypto.randomUUID(),
    title: "תזכורת",
    dueAt: now.toISOString(),
    taskId: null as string | null,
    status: "pending" as const,
    urgency: "medium" as const,
    createdAt: now.toISOString(),
  };
  const medium = evaluateNotificationPolicy({ reminder: rem, profile, now });
  assert.equal(medium.reason, "quiet_hours");
  const urgent = evaluateNotificationPolicy({
    reminder: { ...rem, urgency: "urgent" },
    profile,
    now,
  });
  assert.equal(urgent.channel, "immediate");
});
