import test from "node:test";
import assert from "node:assert/strict";
import { applyActions } from "../lib/engine";
import { emptyState } from "../lib/model";
import {
  enforceReferentialIntegrity,
  groundInterpretations,
  semanticFingerprint,
  SemanticInterpretationSchema,
} from "../lib/agent/semantic";

const now = new Date("2026-09-08T10:00:00.000+03:00");

function stateWithLaundry() {
  return applyActions(
    emptyState(),
    [
      {
        type: "task.create",
        task: { title: "כביסה", kind: "task", categoryId: "laundry" },
      },
      {
        type: "task.create",
        task: {
          title: "פינוי מדיח",
          kind: "task",
          categoryId: "kitchen_dishes",
        },
      },
      {
        type: "member.upsert",
        member: { name: "פלא", type: "child", aliases: ["פלא"] },
      },
    ],
    now,
  );
}

test("domain3: paraphrase complete intents ground to same action", () => {
  const state = stateWithLaundry();
  const laundry = state.tasks.find((t) => t.title === "כביסה")!;
  const paraphrases = [
    {
      intent: "complete_task" as const,
      targetEntityType: "task" as const,
      entityHint: "כביסה",
      evidence: "סיימתי את הכביסה",
    },
    {
      intent: "complete_task" as const,
      targetEntityType: "task" as const,
      entityHint: "כביסה",
      evidence: "הכביסה כבר מאחוריי",
    },
    {
      intent: "complete_task" as const,
      targetEntityType: "task" as const,
      targetId: laundry.id,
      evidence: "אפשר לסמן כביסה כבוצע",
    },
    {
      intent: "complete_task" as const,
      targetEntityType: "task" as const,
      candidateIds: [laundry.id],
      evidence: "גמרתי עם הכביסה",
    },
  ];

  const fingerprints = paraphrases.map((p) => {
    const g = groundInterpretations(state, [p], now);
    assert.equal(g.actions.length, 1);
    assert.equal(g.actions[0].type, "task.status");
    if (g.actions[0].type === "task.status") {
      assert.equal(g.actions[0].id, laundry.id);
      assert.equal(g.actions[0].status, "done");
    }
    return semanticFingerprint(
      SemanticInterpretationSchema.parse(p),
      laundry.id,
    );
  });
  assert.equal(new Set(fingerprints.map((f) => f.split("|")[0])).size, 1);
  assert.ok(fingerprints.every((f) => f.includes(laundry.id)));
});

test("domain3: defer and temporary context are distinct intents", () => {
  const state = stateWithLaundry();
  const living = applyActions(
    state,
    [
      {
        type: "task.create",
        task: {
          title: "סידור סלון",
          kind: "task",
          categoryId: "living_spaces",
        },
      },
    ],
    now,
  );
  const defer = groundInterpretations(
    living,
    [
      {
        intent: "defer",
        targetEntityType: "task",
        entityHint: "סלון",
        evidence: "לא היום עם הסלון",
      },
    ],
    now,
  );
  assert.equal(defer.actions[0]?.type, "task.defer");

  const temp = groundInterpretations(
    living,
    [
      {
        intent: "temporary_fact",
        targetEntityType: "none",
        entityHint: "היום אני עם הילדה כל היום",
        payload: {
          text: "היום אני עם הילדה כל היום",
          expiresAt: "2026-09-09T00:00:00.000+03:00",
        },
        persistence: "temporary",
      },
    ],
    now,
  );
  assert.equal(temp.actions[0]?.type, "fact.add");
  if (temp.actions[0]?.type === "fact.add") {
    assert.equal(temp.actions[0].kind, "temporary");
  }
});

test("domain3: ambiguity does not guess", () => {
  let state = stateWithLaundry();
  state = applyActions(
    state,
    [
      {
        type: "task.create",
        task: { title: "כביסה צבעונית", kind: "task", categoryId: "laundry" },
      },
    ],
    now,
  );
  const g = groundInterpretations(
    state,
    [
      {
        intent: "complete_task",
        targetEntityType: "task",
        entityHint: "כביסה",
        evidence: "סיימתי כביסה",
      },
    ],
    now,
  );
  assert.equal(g.actions.length, 0);
  assert.ok(g.clarification);
  assert.ok(g.unresolved.length >= 1);
});

test("domain3: referential integrity drops invented ids", () => {
  const state = stateWithLaundry();
  const decision = enforceReferentialIntegrity(state, {
    reply: "סימנתי.",
    explicitActions: [
      {
        type: "task.status",
        id: "00000000-0000-4000-8000-000000000099",
        status: "done",
      },
    ],
    clarification: null,
    proposal: null,
    affectsToday: false,
  });
  assert.equal(decision.explicitActions.length, 0);
  assert.ok(decision.clarification);
});

test("domain3: member hint resolves against state", () => {
  const state = stateWithLaundry();
  const member = state.members[0]!;
  const g = groundInterpretations(
    state,
    [
      {
        intent: "create_task",
        targetEntityType: "task",
        payload: { title: "לקבוע תור" },
        relatedMemberHints: ["פלא"],
        evidence: "לקבוע לפלא תור",
      },
    ],
    now,
  );
  assert.equal(g.actions[0]?.type, "task.create");
  if (g.actions[0]?.type === "task.create") {
    assert.deepEqual(g.actions[0].task.relatedMemberIds, [member.id]);
  }
});
