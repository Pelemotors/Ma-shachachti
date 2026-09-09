import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import {
  buildLocalState,
  openLocalDemo,
  openForgotten,
} from "./fixtures/local-demo";

test.describe("P72 מה שכחתי?", () => {
  test("routine household excluded; life-admin included", async ({ page }) => {
    const routineId = randomUUID();
    const state = buildLocalState(
      [
        {
          title: "לפנות מדיח E2E",
          categoryId: "kitchen_dishes",
          routineId,
        },
        {
          title: "לבדוק ביטוח רכב E2E",
          categoryId: "documents_admin",
          priority: 2,
        },
      ],
      [
        {
          id: routineId,
          title: "לפנות מדיח E2E",
          categoryId: "kitchen_dishes",
        },
      ],
    );

    await openLocalDemo(page, state);
    await openForgotten(page);

    await expect(page.getByText("לבדוק ביטוח רכב E2E")).toBeVisible();
    await expect(page.getByText("לפנות מדיח E2E")).toHaveCount(0);
  });
});
