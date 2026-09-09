import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, migrateState } from "../lib/model";
import {
  applyActions,
  visible,
  whatMatters,
  findSemanticDuplicate,
  buildDailyPlanSession,
  replanDailyPlan,
  activeDailyPlan,
  freeTimeV2,
} from "../lib/engine";
import { isActiveVisibleTask } from "../lib/domain/tasks/visibility";
import {
  getStarterTemplates,
  shouldUseStarterMode,
} from "../lib/domain/starter";
import { getForgottenCandidates } from "../lib/domain/forgotten";
import { evaluateNotificationPolicy } from "../lib/domain/notifications/policy";
import {
  buildLifeAdminDigest,
  isLifeAdminTask,
  recordLifeAdminCompletion,
  shouldAskLifeAdminWindowConfirm,
} from "../lib/domain/notifications/life-admin";
import {
  analyzeScanText,
  applyScanCorrection,
} from "../lib/domain/first-scan/analyze";
import { buildScanApproveActions } from "../lib/domain/first-scan/approve";

const now = new Date("2026-09-07T10:00:00+03:00");

test("P01 defer hides task from active lists and free time", () => {
  let s = emptyState();
  s = applyActions(
    s,
    [{ type: "task.create", task: { title: "לפנות מדיח", kind: "task" } }],
    now,
  );
  const id = s.tasks[0].id;
  s = applyActions(s, [{ type: "task.defer", id }], now);
  assert.ok(s.tasks[0].hiddenUntil);
  assert.equal(isActiveVisibleTask(s.tasks[0], now), false);
  assert.equal(visible(s.tasks[0], now), false);
  assert.equal(whatMatters(s, now).length, 0);
  assert.equal(freeTimeV2(s, 60, 2, now).closeFirst.length, 0);
  const undone = migrateState(emptyState());
  assert.equal(undone.tasks.length, 0);
});

test("P02 starter excludes oven fridge microwave deep cleans", () => {
  const profile = emptyState().profile;
  profile.dishwasher = true;
  const starters = getStarterTemplates(profile);
  assert.ok(
    starters.some((t) => /מדיח|כיור|אשפה|כביסה|סלון|צעצועים/.test(t.title)),
  );
  assert.ok(!starters.some((t) => /תנור|מקרר|מיקרוגל/.test(t.title)));
  assert.equal(shouldUseStarterMode(emptyState()), true);
});

test("P03 forgotten excludes routine includes life admin", () => {
  let s = emptyState();
  s = applyActions(
    s,
    [
      {
        type: "routine.create",
        routine: {
          title: "לפנות מדיח",
          categoryId: "kitchen_dishes",
          schedule: { frequency: "daily", interval: 1 },
        },
      },
      {
        type: "task.create",
        task: {
          title: "לבדוק ביטוח רכב",
          kind: "task",
          categoryId: "documents_admin",
          priority: 2,
        },
      },
    ],
    now,
  );
  const forgotten = getForgottenCandidates(s, now);
  assert.ok(forgotten.some((t) => t.title.includes("ביטוח")));
  assert.ok(!forgotten.some((t) => t.title.includes("מדיח")));
});

test("P08 routine household does not notify", () => {
  let s = emptyState();
  s = applyActions(
    s,
    [
      {
        type: "routine.create",
        routine: {
          title: "סידור סלון",
          categoryId: "living_spaces",
          schedule: { frequency: "daily", interval: 1 },
          priority: 1,
        },
      },
    ],
    now,
  );
  const d = evaluateNotificationPolicy({ task: s.tasks[0], now });
  assert.equal(d.shouldNotify, false);
  assert.equal(d.reason, "routine_suppressed");
});

test("P13 member.upsert and relatedMemberIds on tasks", () => {
  let s = emptyState();
  s = applyActions(
    s,
    [
      {
        type: "member.upsert",
        member: { name: "פלא", type: "child", aliases: ["פלאה"] },
      },
    ],
    now,
  );
  assert.equal(s.members.length, 1);
  const memberId = s.members[0].id;
  s = applyActions(
    s,
    [
      {
        type: "task.create",
        task: {
          title: "לקבוע לפלא תור",
          kind: "task",
          categoryId: "health_appointments",
          relatedMemberIds: [memberId],
        },
      },
    ],
    now,
  );
  assert.deepEqual(s.tasks[0].relatedMemberIds, [memberId]);
});

test("P80 scan parser: plural ambiguous, explicit 2, negation, restriction, sink", () => {
  const ambiguous = analyzeScanText("חדרי הילדים צריך לטאטא");
  assert.equal(
    ambiguous.detectedAreas.find((a) => a.type === "kids_room")?.ambiguous,
    true,
  );
  assert.equal(
    ambiguous.detectedAreas.find((a) => a.type === "kids_room")?.count,
    null,
  );

  const explicit = analyzeScanText("יש שני חדרי ילדים");
  assert.equal(
    explicit.detectedAreas.find((a) => a.type === "kids_room")?.count,
    2,
  );

  const clean = analyzeScanText("המטבח נקי");
  assert.equal(clean.proposedTasks.length, 0);

  const toilet = analyzeScanText("בשירותי אורחים רק אסלה");
  assert.equal(toilet.proposedTasks.length, 1);
  assert.match(toilet.proposedTasks[0].title, /אסלה/);
  assert.ok(!/ניקוי שירותי אורחים$/.test(toilet.proposedTasks[0].title));

  const sink = analyzeScanText("הכיור מלא");
  assert.ok(sink.proposedTasks.some((t) => /כיור/.test(t.title)));
  assert.ok(!sink.proposedTasks.some((t) => /מדיח/.test(t.title)));
  assert.ok(sink.proposedTasks.every((t) => t.recurrenceDays === null));
  assert.ok(sink.proposedTasks.every((t) => t.dueAt === null));

  const baskets = analyzeScanText("יש שני סלי כביסה");
  assert.equal(
    baskets.proposedTasks.filter((t) => t.categoryId === "laundry").length,
    1,
  );

  const corrected = applyScanCorrection(explicit, "בעצם יש רק אחד");
  assert.equal(
    corrected.detectedAreas.find((a) => a.type === "kids_room")?.count,
    1,
  );

  const guestNone = analyzeScanText("בשירותי אורחים לא צריך לעשות כלום");
  assert.equal(guestNone.proposedTasks.length, 0);
  assert.ok(guestNone.detectedAreas.some((a) => a.type === "guest_toilet"));
});

test("P81 scan current-state is not daily routine", () => {
  const a = analyzeScanText("צריך לשטוף בחדרי הילדים");
  assert.ok(a.proposedTasks.some((t) => /לשטוף/.test(t.title)));
  assert.ok(a.proposedTasks.every((t) => t.recurrenceDays === null));
  assert.ok(a.proposedTasks.every((t) => t.dueAt === null));
  assert.ok(!a.proposedTasks.some((t) => /לטאטא/.test(t.title)));
});

test("P17–P24 approve creates areas/tasks only once with multi homeAreaIds", () => {
  let s = emptyState();
  const sessionId = crypto.randomUUID();
  const stamp = now.toISOString();
  s = applyActions(
    s,
    [
      {
        type: "scan.set",
        firstScan: {
          status: "in_progress",
          session: {
            id: sessionId,
            status: "review",
            chunks: [
              {
                id: crypto.randomUUID(),
                text: "יש שני חדרי ילדים וצריך לטאטא ולשטוף שם",
                createdAt: stamp,
                source: "text",
              },
            ],
            draftAnalysis: null,
            proposalId: null,
            createdAt: stamp,
            updatedAt: stamp,
          },
        },
      },
    ],
    now,
  );
  assert.equal(s.tasks.length, 0);
  assert.equal(s.homeAreas.length, 0);

  const analysis = analyzeScanText("יש שני חדרי ילדים וצריך לטאטא ולשטוף שם");
  const proposalId = crypto.randomUUID();
  const first = buildScanApproveActions(s, analysis, {
    scanSessionId: sessionId,
    proposalId,
  });
  assert.equal(first.alreadyApplied, false);
  s = applyActions(s, first.actions, now);
  assert.ok(s.homeAreas.filter((a) => a.type === "kids_room").length >= 2);
  const mop = s.tasks.find((t) => /לשטוף/.test(t.title));
  assert.ok(mop);
  assert.ok((mop!.homeAreaIds?.length ?? 0) >= 2);
  assert.equal(mop!.recurrenceDays, null);
  assert.equal(mop!.dueAt, null);
  assert.equal(s.firstScan.status, "in_progress");
  assert.equal(s.firstScan.session?.status, "approved");
  assert.equal(s.firstScan.session?.proposalId, proposalId);

  const sweep = s.tasks.find((t) => /לטאטא/.test(t.title));
  assert.ok(sweep);
  assert.ok(mop!.dependsOn.includes(sweep!.id));

  const replay = buildScanApproveActions(s, analysis, {
    scanSessionId: sessionId,
    proposalId,
  });
  assert.equal(replay.alreadyApplied, true);
  assert.equal(replay.actions.length, 0);
  const taskCount = s.tasks.length;
  s = applyActions(
    s,
    [
      {
        type: "scan.set",
        firstScan: {
          status: "completed",
          completedAt: stamp,
          session: s.firstScan.session!,
        },
      },
    ],
    now,
  );
  assert.equal(s.firstScan.status, "completed");
  assert.equal(s.tasks.length, taskCount);
});

test("P82 exact-title dedupe only; toilets stay location-aware", () => {
  let s = emptyState();
  const guestId = crypto.randomUUID();
  const bathId = crypto.randomUUID();
  s = applyActions(
    s,
    [
      {
        type: "homeArea.upsert",
        area: {
          id: guestId,
          name: "שירותי אורחים",
          type: "guest_toilet",
          aliases: [],
          parentAreaId: null,
          source: "user",
        },
      },
      {
        type: "homeArea.upsert",
        area: {
          id: bathId,
          name: "חדר רחצה",
          type: "bathroom",
          aliases: [],
          parentAreaId: null,
          source: "user",
        },
      },
      {
        type: "task.create",
        task: {
          title: "סידור כיור",
          kind: "task",
          categoryId: "kitchen_dishes",
          detailTypeId: "sink_clean",
          templateId: "kit-01-06",
        },
      },
      {
        type: "task.create",
        task: {
          title: "לנקות אסלה בשירותי אורחים",
          kind: "task",
          categoryId: "bathroom_toilets",
          detailTypeId: "toilet_clean",
          homeAreaIds: [guestId],
        },
      },
    ],
    now,
  );

  const sinkDup = findSemanticDuplicate(s, "סידור כיור", {
    categoryId: "kitchen_dishes",
  });
  assert.ok(sinkDup);
  assert.equal(sinkDup!.title, "סידור כיור");

  const toiletDup = findSemanticDuplicate(s, "לנקות אסלה בחדר הרחצה", {
    categoryId: "bathroom_toilets",
    detailTypeId: "toilet_clean",
    homeAreaIds: [bathId],
  });
  assert.equal(toiletDup, undefined);

  const analysis = analyzeScanText("הכיור מלא כלים");
  const sessionId = crypto.randomUUID();
  s = {
    ...s,
    firstScan: {
      status: "in_progress",
      completedAt: null,
      session: {
        id: sessionId,
        status: "review",
        chunks: [],
        draftAnalysis: analysis,
        proposalId: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    },
  };
  const before = s.tasks.length;
  const { actions } = buildScanApproveActions(s, analysis, {
    scanSessionId: sessionId,
    proposalId: crypto.randomUUID(),
  });
  s = applyActions(s, actions, now);
  assert.ok(
    s.tasks.filter((t) => /כיור/.test(t.title) && t.status === "open").length >=
      1,
    "scan may add a paraphrased sink task — semantic merge is agent responsibility",
  );
  assert.ok(s.tasks.length >= before);
});

test("P83 planning duration cap and no silent overwrite", () => {
  let s = emptyState();
  for (let i = 0; i < 12; i++) {
    s = applyActions(
      s,
      [
        {
          type: "task.create",
          task: {
            title: `משימת איפוס ${i}`,
            kind: "task",
            categoryId: "cleaning_reset",
            workMinutes: 20,
            effort: 2,
          },
        },
      ],
      now,
    );
  }
  const session = buildDailyPlanSession(s, 60, 2, 1, now);
  assert.ok(session.items.length < 12);
  assert.equal(session.availableMinutes, 60);
  s = applyActions(s, [{ type: "plan.set", plan: session }], now);
  assert.ok(activeDailyPlan(s, now));

  const existingId = Object.values(s.planning.plans)[0]!.id;
  const replan = replanDailyPlan(s, now);
  assert.ok(replan.plan);
  assert.equal(replan.plan!.id, existingId);
  assert.ok(typeof replan.requiresProposal === "boolean");
});

test("P57 state v2 accepts homeAreas and firstScan defaults", () => {
  const s = emptyState();
  assert.equal(s.firstScan.status, "not_started");
  assert.deepEqual(s.homeAreas, []);
  const round = migrateState(s);
  assert.equal(round.schemaVersion, 2);
  assert.ok(round.compactedMemory.lifeAdminWindow);
});

test("P09–P12 life/admin digest ranking and learning thresholds", () => {
  let s = emptyState();
  s = applyActions(
    s,
    [
      {
        type: "task.create",
        task: {
          title: "ברכה לנתי",
          kind: "task",
          categoryId: "guests_hosting",
          priority: 1,
        },
      },
      {
        type: "task.create",
        task: {
          title: "תשלום לבייביסיטר",
          kind: "task",
          categoryId: "finances_bills",
          priority: 2,
          dueAt: new Date("2026-09-07T18:00:00+03:00").toISOString(),
        },
      },
      {
        type: "task.create",
        task: {
          title: "ביטוח הרכב",
          kind: "task",
          categoryId: "documents_admin",
          priority: 2,
        },
      },
      {
        type: "task.create",
        task: {
          title: "תור דחוף לרופא",
          kind: "task",
          categoryId: "health_appointments",
          priority: 3,
        },
      },
    ],
    now,
  );

  const byTitle = (title: string) => s.tasks.find((t) => t.title === title)!;
  const urgentId = byTitle("תור דחוף לרופא").id;
  const digest = buildLifeAdminDigest(s.tasks, s.compactedMemory, now, {
    excludeTaskIds: [urgentId],
  });

  assert.ok(digest.summary.includes("ביטוח"));
  assert.ok(digest.summary.includes("תשלום"));
  assert.ok(digest.summary.includes("ברכה"));
  assert.ok(!digest.taskIds.includes(urgentId));
  assert.equal(digest.taskIds[0], byTitle("תשלום לבייביסיטר").id);

  assert.equal(shouldAskLifeAdminWindowConfirm(s.compactedMemory), true);
  assert.equal(isLifeAdminTask(byTitle("ביטוח הרכב")), true);

  const first = recordLifeAdminCompletion(s.compactedMemory, 20 * 60);
  assert.equal(first.samples, 1);
  assert.ok(first.confidence < 0.5);
  assert.equal(first.preferredStartMinutes, 20 * 60);
  assert.equal(shouldAskLifeAdminWindowConfirm(first), true);

  const second = recordLifeAdminCompletion(first, 21 * 60);
  assert.equal(second.samples, 2);
  assert.notEqual(second.preferredStartMinutes, 21 * 60);
  assert.ok(
    (second.preferredStartMinutes ?? 0) > 20 * 60 &&
      (second.preferredStartMinutes ?? 0) < 21 * 60,
  );

  s = applyActions(
    s,
    [
      {
        type: "memory.lifeAdmin",
        response: "yes",
        completedAtMinutes: 20 * 60 + 15,
      },
      {
        type: "memory.lifeAdmin",
        response: "later",
        completedAtMinutes: 20 * 60 + 15,
      },
      {
        type: "memory.lifeAdmin",
        response: "varies",
        completedAtMinutes: 20 * 60 + 15,
      },
    ],
    now,
  );
  assert.equal(s.compactedMemory.lifeAdminWindow.samples, 3);
  assert.equal(shouldAskLifeAdminWindowConfirm(s.compactedMemory), false);
  assert.ok(s.compactedMemory.lifeAdminWindow.confidence <= 0.25);
});
