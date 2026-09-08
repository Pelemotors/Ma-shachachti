import { test, expect } from "@playwright/test";
import { openLocalDemo, buildLocalState } from "./fixtures/local-demo";

test("P69 root redirects toward app shell", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/(app|login)/);
});

test("P69 local demo can open app and create a minimal task", async ({
  page,
}) => {
  const title = "משימת עשן E2E";
  await openLocalDemo(page, buildLocalState([]));
  await page
    .getByRole("navigation", { name: /ניווט ראשי/i })
    .getByRole("button", { name: /^משימות$/i })
    .click();
  await page.getByRole("button", { name: /^מפורט$/i }).click();
  await page.getByRole("button", { name: /משימה/i }).first().click();
  await page.getByLabel(/מה צריך לעשות/i).fill(title);
  await page.getByRole("button", { name: /^שמירה$/i }).click();
  await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });
});

test("P69 duration wheel appears on plan setup", async ({ page }) => {
  await openLocalDemo(page, buildLocalState([]));
  await page.getByRole("button", { name: /מה שונה היום/i }).click();
  await expect(page.getByText(/שעות|דקות|משך|זמן/i).first()).toBeVisible({
    timeout: 10_000,
  });
});
