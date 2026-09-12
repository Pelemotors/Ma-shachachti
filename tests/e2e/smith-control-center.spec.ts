import { expect, test } from "@playwright/test";

const emptyDashboard = {
  enabled: false,
  setup: {
    github: "disconnected",
    preview: "disconnected",
    testEnvironment: "local_only",
    playwright: "not_configured",
    productionGate: "disconnected",
  },
  summary: {
    systemHealth: null,
    activeUsers: null,
    activeIncidents: null,
    readyPreviews: null,
    pendingApprovals: null,
  },
  currentJob: null,
  observations: [],
  workItems: [],
  previews: [],
  tests: [],
  approvals: [],
  audit: [],
};

test("unauthenticated Admin sees a real access boundary", async ({ page }) => {
  await page.route("**/api/admin/smith/overview", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "unauthorized" }),
    }),
  );
  await page.goto("/admin/smith");
  await expect(
    page.getByRole("heading", { name: "נדרשת כניסת מנהל" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "מעבר ל־Admin" })).toBeVisible();
});

test("disconnected dashboard renders no fake operational data", async ({
  page,
}) => {
  await page.route("**/api/admin/smith/overview", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(emptyDashboard),
    }),
  );
  await page.goto("/admin/smith");

  await expect(page.getByRole("heading", { name: "מרכז הבקרה" })).toBeVisible();
  await expect(
    page.getByText("Smith Control Plane עדיין לא מחובר."),
  ).toBeVisible();
  await expect(page.getByText("לא זוהו אירועים חריגים כרגע.")).toBeVisible();
  await expect(
    page.getByText("Preview Provider עדיין לא הוגדר."),
  ).toBeVisible();
  await expect(page.getByText("אין שינויים שממתינים לאישור.")).toBeVisible();

  const summaryValues = page.locator(".smith-summary-card strong");
  await expect(summaryValues).toHaveCount(5);
  for (let index = 0; index < 5; index += 1) {
    await expect(summaryValues.nth(index)).toHaveText("—");
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test("mobile navigation remains keyboard and touch reachable", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "mobile project only");
  await page.route("**/api/admin/smith/overview", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(emptyDashboard),
    }),
  );
  await page.goto("/admin/smith");
  const menu = page.getByRole("button", { name: "פתיחת ניווט" });
  await expect(menu).toBeVisible();
  await menu.click();
  await expect(
    page.getByRole("navigation", { name: "ניווט Smith" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Preview Lab" })).toBeVisible();
});
