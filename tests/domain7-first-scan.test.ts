import test from "node:test";
import assert from "node:assert/strict";
import { parseSemanticScanResult } from "../lib/domain/first-scan/semantic";

test("domain7: semantic scan strips invented routine/deadline from LLM output", () => {
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
  const fromAi = parseSemanticScanResult(semantic);
  assert.equal(fromAi.proposedTasks[0]?.recurrenceDays, null);
  assert.equal(fromAi.proposedTasks[0]?.dueAt, null);
});
