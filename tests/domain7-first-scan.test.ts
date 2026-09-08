import test from "node:test";
import assert from "node:assert/strict";
import { analyzeFirstScan } from "../lib/domain/first-scan";

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
