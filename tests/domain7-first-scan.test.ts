import test from "node:test";
import assert from "node:assert/strict";
import { parseSemanticScanResult } from "../lib/domain/first-scan/semantic";

test("domain7: valid recurrence and datetime deadline supplied by agent are kept", () => {
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
        deadline: {
          date: "2026-09-09",
          time: "13:00",
          timezone: "Asia/Jerusalem",
          precision: "datetime",
        },
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
  const fromAi = parseSemanticScanResult(semantic);
  assert.equal(fromAi.proposedTasks[0]?.recurrenceDays, 1);
  assert.equal(fromAi.proposedTasks[0]?.dueAt, "2026-09-09T10:00:00.000Z");
  assert.equal(fromAi.proposedTasks[0]?.deadline?.precision, "datetime");
});

test("domain7: date-only deadline does not receive an invented hour", () => {
  const fromAi = parseSemanticScanResult({
    detectedAreas: [],
    observations: [],
    proposedTasks: [
      {
        title: "לשלם ארנונה",
        categoryId: "finances_bills",
        detailTypeId: null,
        homeAreaNames: [],
        dependsOnTitles: [],
        relatedMemberNames: [],
        recurrenceDays: null,
        dueAt: "2026-09-20",
      },
    ],
    profileFacts: [],
    clarification: null,
    inventedRoutine: false,
    inventedDeadline: false,
    inventedResponsibility: false,
    inventedDuration: false,
  });
  assert.equal(fromAi.proposedTasks[0]?.dueAt, null);
  assert.equal(fromAi.proposedTasks[0]?.deadline?.precision, "date");
  assert.equal(fromAi.proposedTasks[0]?.deadline?.date, "2026-09-20");
  assert.equal(fromAi.proposedTasks[0]?.deadline?.time, null);
});

test("domain7: invented flags still strip timing the agent marked as invented", () => {
  const fromAi = parseSemanticScanResult({
    detectedAreas: [],
    observations: [],
    proposedTasks: [
      {
        title: "משימה מומצאת",
        categoryId: "unclassified",
        detailTypeId: null,
        homeAreaNames: [],
        dependsOnTitles: [],
        relatedMemberNames: [],
        recurrenceDays: 7,
        dueAt: "2026-09-09T10:00:00.000Z",
      },
    ],
    profileFacts: [],
    clarification: null,
    inventedRoutine: true,
    inventedDeadline: true,
    inventedResponsibility: false,
    inventedDuration: false,
  });
  assert.equal(fromAi.proposedTasks[0]?.recurrenceDays, null);
  assert.equal(fromAi.proposedTasks[0]?.dueAt, null);
  assert.equal(fromAi.proposedTasks[0]?.deadline ?? null, null);
});
