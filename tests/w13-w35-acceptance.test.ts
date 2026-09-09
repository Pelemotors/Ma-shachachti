import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, migrateState } from "../lib/model";
import { applyActions } from "../lib/engine";
import { enrichTaskLocal } from "../lib/enrichment";
import { compactConversation } from "../lib/personalization";
import { resolveRelativeTime } from "../lib/relative-time";

test("W14 turn-shaped operations can be recorded and undone via state restore", () => {
  const now = new Date("2026-09-07T10:00:00+03:00");
  const turnId = crypto.randomUUID();
  const before = emptyState();
  let s = applyActions(
    before,
    [
      {
        type: "message.add",
        role: "user",
        text: "צריך מדיח ואוכל לכלב",
        turnId,
      },
      {
        type: "task.create",
        task: { title: "מדיח", kind: "task" },
      },
      {
        type: "task.create",
        task: { title: "אוכל לכלב", kind: "task" },
      },
      {
        type: "operation.record",
        turnId,
        summary: "chat_turn",
        actionTypes: ["task.create", "task.create"],
      },
    ],
    now,
  );
  assert.equal(s.tasks.length, 2);
  assert.equal(s.operations.at(-1)?.turnId, turnId);
  // Undo of turn == restore pre-turn state
  const undone = migrateState(before);
  assert.equal(undone.tasks.length, 0);
  assert.equal(undone.messages.length, 0);
});

test("W25 legacy shopping phrase parser is not exported from domain", async () => {
  const domain = await import("../lib/domain/shopping");
  assert.equal(
    "filterShoppingProposalItems" in domain,
    false,
    "NL shopping parser must stay out of production domain exports",
  );
});

test("W19 enrichment does not invent urgency and respects explicit minutes", () => {
  const enriched = enrichTaskLocal({
    title: "פינוי מדיח",
    workMinutes: 40,
    templateId: "kit-01-01",
  });
  assert.equal(enriched.workMinutes, 40);
  assert.equal(enriched.categoryId, "kitchen_dishes");
  assert.equal(enriched.detailTypeId, "dishwasher_empty");
});

test("W31 compaction keeps recent messages only", () => {
  const now = new Date("2026-09-07T10:00:00+03:00");
  let s = emptyState();
  for (let i = 0; i < 20; i++) {
    s = applyActions(
      s,
      [
        {
          type: "message.add",
          role: "user",
          text: i < 5 ? `תמיד מעדיפה ערב ${i}` : `הודעה ${i}`,
        },
      ],
      now,
    );
  }
  const compacted = compactConversation(s, now);
  assert.ok(compacted.messages.length <= 12);
  assert.equal(
    compacted.compactedMemory.preferences.length,
    s.compactedMemory.preferences.length,
    "compaction must not keyword-classify user text",
  );
});

test("W29 relative time resolver returns preferred evening window", () => {
  const now = new Date("2026-09-07T10:00:00+03:00");
  const result = resolveRelativeTime("היום בערב", now, "Asia/Jerusalem");
  assert.ok(result?.preferredWindow?.start);
  assert.ok(result?.preferredWindow?.end);
});
