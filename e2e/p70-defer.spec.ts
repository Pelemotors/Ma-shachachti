import { test, expect } from "@playwright/test";
import {
  buildLocalState,
  openLocalDemo,
  openTasksDetailed,
  LOCAL_STORAGE_KEY,
} from "./fixtures/local-demo";

test.describe("P70 לא היום", () => {
  test("defer hides task, undo restores, refresh keeps hidden", async ({
    page,
  }) => {
    const title = "משימת דחייה E2E";
    const state = buildLocalState([{ title }]);

    await openLocalDemo(page, state);
    await openTasksDetailed(page);
    await expect(page.getByText(title)).toBeVisible();

    await page
      .locator("article.task-card", { hasText: title })
      .getByRole("button", { name: /^לא היום$/ })
      .click();

    await expect(page.getByText(title)).toHaveCount(0);
    await expect(page.getByText(/נשמר במכשיר הזה/i)).toBeVisible();

    await page
      .getByRole("status")
      .getByRole("button", { name: /ביטול/i })
      .click();
    await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });

    await page
      .locator("article.task-card", { hasText: title })
      .getByRole("button", { name: /^לא היום$/ })
      .click();
    await expect(page.getByText(title)).toHaveCount(0);

    await page.reload();
    const localBtn = page.getByRole("button", {
      name: /התנסות מקומית|הדגמה|מקומ/i,
    });
    await expect(localBtn.first()).toBeVisible({ timeout: 30_000 });
    await localBtn.first().click();
    await expect(page.getByText(/הדגמה במכשיר הזה/i)).toBeVisible();

    await openTasksDetailed(page);
    await expect(page.getByText(title)).toHaveCount(0);

    const stored = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      LOCAL_STORAGE_KEY,
    );
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    const task = parsed.tasks.find((t: { title: string }) => t.title === title);
    expect(task?.hiddenUntil).toBeTruthy();
  });
});
