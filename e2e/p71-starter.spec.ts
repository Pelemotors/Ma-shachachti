import { test, expect } from "@playwright/test";
import { buildLocalState, openLocalDemo, openKit } from "./fixtures/local-demo";

test.describe("P71 starter mode", () => {
  test("starter kit hides oven fridge microwave deep cleans", async ({
    page,
  }) => {
    await openLocalDemo(page, buildLocalState([]));
    await openKit(page);

    await expect(page.getByText(/אלה הצעות בלבד/i)).toBeVisible();

    const domain = page.getByLabel(/תחום הצעות/i);
    await domain.selectOption("kitchen_dishes");
    await expect(page.getByText(/^ניקוי תנור$/)).toHaveCount(0);
    await expect(page.getByText(/^ניקוי מיקרוגל$/)).toHaveCount(0);

    await domain.selectOption("fridge_pantry");
    await expect(page.getByText(/^ניקוי מקרר$/)).toHaveCount(0);

    await domain.selectOption("הכול");
    await expect(
      page
        .locator("article.suggestion h3")
        .filter({ hasText: /מדיח|כיור|אשפה|כביסה|סלון|צעצועים/ })
        .first(),
    ).toBeVisible();
    await expect(page.getByText(/^ניקוי תנור$/)).toHaveCount(0);
    await expect(page.getByText(/^ניקוי מקרר$/)).toHaveCount(0);
    await expect(page.getByText(/^ניקוי מיקרוגל$/)).toHaveCount(0);
  });
});
