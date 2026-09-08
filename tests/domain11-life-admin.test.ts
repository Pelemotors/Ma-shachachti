import test from "node:test";
import assert from "node:assert/strict";
import { applyActions } from "../lib/engine";
import { emptyState } from "../lib/model";
import { isLifeAdminTask } from "../lib/domain/notifications/life-admin";

const now = new Date("2026-09-08T10:00:00.000+03:00");

test("domain11: life-admin is category-first", () => {
  const s = applyActions(
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
