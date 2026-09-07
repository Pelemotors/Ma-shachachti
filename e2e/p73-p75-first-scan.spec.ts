import { test, expect } from "@playwright/test";
import { buildLocalState, openLocalDemo, openKit } from "./fixtures/local-demo";

test.describe("P73–P75 First Scan (text path)", () => {
  test("preview, correction, approve, and refresh keep completed scan", async ({
    page,
  }) => {
    await openLocalDemo(page, buildLocalState([]));
    await openKit(page);

    await page.getByRole("button", { name: /^התחל סקירה$/ }).click();
    await expect(page.getByText(/סקירה ראשונה של הבית/i)).toBeVisible();

    const scanBox = page.getByLabel(/תיאור מה שרואים בבית/i);
    await scanBox.fill("יש שני חדרי ילדים וצריך לטאטא ולשטוף שם. הכיור מלא.");
    await page.getByRole("button", { name: /סיימתי את הסקירה/i }).click();

    await expect(page.getByText(/הבנתי שיש בבית/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/חדרי ילדים/i).first()).toBeVisible();
    await expect(page.getByText(/ומה שצריך כרגע/i)).toBeVisible();

    await page.getByLabel(/תיקון לטיוטת הסקירה/i).fill("בעצם יש רק אחד");
    await page.getByRole("button", { name: /עדכון טיוטה/i }).click();
    await expect(page.getByText(/חדר ילדים|חדרי ילדים/i).first()).toBeVisible();

    await page.getByRole("button", { name: /נכון, בוא נמשיך/i }).click();
    await expect(page.getByText(/כמה זמן וכוח יש לך/i)).toBeVisible({
      timeout: 15_000,
    });

    await page
      .getByRole("button", { name: /שמור לי את המשימות בלבד/i })
      .click();

    await expect(page.getByText(/סקירה מהירה של הבית/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("button", { name: /התחל סקירה מהירה/i }),
    ).toBeVisible();

    await page.reload();
    const localBtn = page.getByRole("button", {
      name: /התנסות מקומית|הדגמה|מקומ/i,
    });
    await expect(localBtn.first()).toBeVisible({ timeout: 30_000 });
    await localBtn.first().click();
    await openKit(page);
    await expect(
      page.getByRole("button", { name: /התחל סקירה מהירה/i }),
    ).toBeVisible();
  });
});
