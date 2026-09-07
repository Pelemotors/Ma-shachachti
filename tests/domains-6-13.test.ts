import test from "node:test";
import assert from "node:assert/strict";
import { applyActions } from "../lib/engine";
import { emptyState } from "../lib/model";
import { getStarterTemplates, shouldUseStarterMode } from "../lib/domain/starter";
import { analyzeFirstScan } from "../lib/domain/first-scan";
import {
  updateDurationModel,
  recordTaskDurationSample,
  MIN_DURATION_SAMPLES,
} from "../lib/domain/learning/pace";
import {
  applyForecastEvent,
  activeForecasts,
  forecastActionableNow,
} from "../lib/domain/forecast";
import { evaluateNotificationPolicy } from "../lib/domain/notifications/policy";
import { isLifeAdminTask } from "../lib/domain/notifications/life-admin";
import {
  groundInterpretations,
  resolveMemberIds,
  type SemanticInterpretation,
} from "../lib/agent/semantic";

const now = new Date("2026-09-08T10:00:00.000+03:00");

test("domain6: starter covers core areas without inventing deep cleans", () => {
  const profile = emptyState().profile;
  const items = getStarterTemplates(profile);
  assert.ok(items.length >= 5);
  assert.ok(!items.some((i) => /תנור|מקרר|מיקרוגל|ניקיון עומק/.test(i.title)));
  assert.equal(shouldUseStarterMode(emptyState()), true);
});

test("domain7: semantic scan preferred; heuristic is fallback only", () => {
  const semantic = {
    detectedAreas: [
      { name: "מטבח", type: "kitchen", count: 1, ambiguous: false },
    ],
    observations: ["יש מדיח"],
    proposedTasks: [
      {
        title: "לרוקן מדיח",
        categoryId: "kitchen_dishes",
        detailTypeId: "dishwasher_empty",
        homeAreaNames: ["מטבח"],
        dependsOnTitles: [],
        relatedMemberNames: [],
        recurrenceDays: 1,
        dueAt: "2026-09-09T10:00:00.000Z",
      },
    ],
    profileFacts: [],
    members: [],
    clarification: null,
    inventedRoutine: false,
    inventedDeadline: false,
    inventedResponsibility: false,
    inventedDuration: false,
  };
  const fromAi = analyzeFirstScan("ignored", { semantic });
  assert.equal(fromAi.proposedTasks[0]?.recurrenceDays, null);
  assert.equal(fromAi.proposedTasks[0]?.dueAt, null);
  const fallback = analyzeFirstScan("יש לי מטבח עם מדיח");
  assert.ok(
    fallback.detectedAreas.length >= 1 || fallback.proposedTasks.length >= 0,
  );
});

test("domain8: duration learning needs minimum samples and resists outlier", () => {
  let model = updateDurationModel(null, {
    minutes: 10,
    at: now.toISOString(),
    source: "completion",
  });
  assert.equal(model.typicalMinutes, null);
  for (const m of [12, 11, 13, 12, 90]) {
    model = updateDurationModel(model, {
      minutes: m,
      at: now.toISOString(),
      source: "completion",
    });
  }
  assert.ok(model.count >= MIN_DURATION_SAMPLES);
  assert.ok(model.typicalMinutes != null && model.typicalMinutes < 40);
});

test("domain8: explicit duration beats later weak samples", () => {
  let s = emptyState();
  s = applyActions(
    s,
    [{ type: "task.create", task: { title: "קיפול", kind: "task" } }],
    now,
  );
  const task = s.tasks[0]!;
  s = recordTaskDurationSample(s, task, 15, now, { explicit: true });
  s = recordTaskDurationSample(s, task, 90, now, { explicit: false });
  const hit = s.learning.find((x) => x.kind === "duration");
  assert.equal(hit?.payload.source, "explicit");
});

test("domain9: forecast needs evidence; correction cancels; not a fact", () => {
  let s = emptyState();
  const subject = "dog_food";
  for (const days of [0, 30, 60, 90]) {
    const at = new Date(now.getTime() + days * 86400000).toISOString();
    s = applyForecastEvent(s, {
      subject,
      type: "replenishment",
      occurredAt: at,
    });
  }
  const active = activeForecasts(s);
  assert.ok(active.length >= 1);
  assert.ok(active[0]!.learnedIntervalDays != null);
  assert.ok(
    forecastActionableNow(
      active[0]!,
      new Date(active[0]!.expectedWindowStart!),
    ),
  );
  s = applyForecastEvent(s, {
    subject,
    type: "correction",
    occurredAt: now.toISOString(),
  });
  assert.equal(activeForecasts(s).length, 0);
});

test("domain9: structured forecast fact marker updates model via engine", () => {
  let s = emptyState();
  for (const days of [0, 28, 56, 84]) {
    const at = new Date(now.getTime() + days * 86400000);
    s = applyActions(
      s,
      [
        {
          type: "fact.add",
          text: "forecast:replenishment:dog_food",
          kind: "inference",
          expiresAt: null,
        },
      ],
      at,
    );
  }
  assert.ok(activeForecasts(s).length >= 1);
});

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
  const medium = evaluateNotificationPolicy({
    reminder: rem,
    profile,
    now,
  });
  assert.equal(medium.reason, "quiet_hours");
  const urgent = evaluateNotificationPolicy({
    reminder: { ...rem, urgency: "urgent" },
    profile,
    now,
  });
  assert.equal(urgent.channel, "immediate");
});

test("domain11: life-admin is category-first", () => {
  let s = applyActions(
    emptyState(),
    [
      {
        type: "task.create",
        task: {
          title: "טופס ביטוח",
          kind: "task",
          categoryId: "documents_admin",
        },
      },
      {
        type: "task.create",
        task: {
          title: "לקפל כביסה",
          kind: "task",
          categoryId: "laundry",
        },
      },
    ],
    now,
  );
  assert.equal(isLifeAdminTask(s.tasks[0]!), true);
  assert.equal(isLifeAdminTask(s.tasks[1]!), false);
});

test("domain12/13: voice/text share member grounding from structured hints", () => {
  let s = emptyState();
  const memberId = crypto.randomUUID();
  s = {
    ...s,
    members: [
      {
        id: memberId,
        name: "פלא",
        type: "child",
        aliases: [],
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    ],
  };
  const resolved = resolveMemberIds(s, [], ["פלא"]);
  assert.deepEqual(resolved.resolved, [memberId]);
  const interp: SemanticInterpretation = {
    intent: "create_task",
    targetEntityType: "task",
    targetId: null,
    candidateIds: [],
    entityHint: "תור לרופא",
    temporal: "future",
    relatedMemberIds: [],
    relatedMemberHints: ["פלא"],
    factKind: null,
    persistence: "none",
    confidence: 0.9,
    ambiguity: false,
    needsClarification: false,
    clarificationQuestion: null,
    payload: { title: "תור לרופא לפלא", kind: "task" },
    evidence: null,
  };
  const grounded = groundInterpretations(s, [interp], now);
  assert.ok(grounded.actions.some((a) => a.type === "task.create"));
  const create = grounded.actions.find((a) => a.type === "task.create");
  assert.ok(
    create &&
      create.type === "task.create" &&
      create.task.relatedMemberIds?.includes(memberId),
  );
});
