import { expect, test, type Page } from "@playwright/test";

const smithState = {
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

async function mockControlCenter(page: Page) {
  const responses: Record<string, unknown> = {
    "/api/admin/overview": {
      stats: {
        users: 9,
        approved: 7,
        pending: 2,
        active7: 5,
        tasks: 12,
        completed: 4,
        ai7: 8,
        aiAttempts7: 10,
        aiFailures7: 2,
        aiAverageLatencyMs: 640,
        reminders7: 3,
        reminderErrors: 1,
      },
      recent: [
        {
          event_type: "ai.failure",
          created_at: "2026-09-12T12:00:00.000Z",
        },
      ],
      generatedAt: "2026-09-12T12:00:00.000Z",
    },
    "/api/admin/health": {
      database: "healthy",
      latencyMs: 18,
      services: { supabase: true, openai: true, push: false, cron: true },
      serviceDetails: {
        supabase: { configured: true, status: "available" },
        openai: { configured: true, status: "available" },
        push: { configured: false, status: "not_configured" },
        cron: {
          configured: true,
          status: "available",
          lastRunAt: "2026-09-12T11:00:00.000Z",
        },
      },
      checkedAt: "2026-09-12T12:00:00.000Z",
    },
    "/api/admin/ai": {
      attempts: 10,
      successes: 8,
      failures: 2,
      successRate: 80,
      averageLatencyMs: 640,
      failureCodes: { unknown: 2 },
      lastTestedAt: "2026-09-12T12:00:00.000Z",
    },
    "/api/admin/tasks": { total: 12, byStatus: { open: 8, done: 4 } },
    "/api/admin/users": { users: new Array(9).fill({ approved: true }) },
    "/api/admin/activity?limit=30": {
      events: [
        {
          id: "event-1",
          event_type: "admin.access.changed",
          created_at: "2026-09-12T12:00:00.000Z",
        },
      ],
    },
    "/api/admin/smith/overview": smithState,
    "/api/admin/diagnostics/evidence": {
      playwright: {
        status: "PASSED",
        environment: "local",
        executedAt: "2026-09-12T12:00:00.000Z",
        results: { passed: 5, failed: 0, skipped: 1 },
        sourceState: "isolated fixture",
        approvalEvidence: false,
      },
    },
  };
  await page.route("**/api/admin/**", (route) => {
    const url = new URL(route.request().url());
    const key = `${url.pathname}${url.search}`;
    const body = responses[key];
    return route.fulfill({
      status: body ? 200 : 404,
      contentType: "application/json",
      body: JSON.stringify(body ?? { error: "not mocked" }),
    });
  });
}

test("unauthenticated Admin sees a real access boundary", async ({ page }) => {
  await page.route("**/api/admin/**", (route) =>
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
});

test("Control Center renders real API values while Smith remains off", async ({
  page,
}) => {
  await mockControlCenter(page);
  await page.goto("/admin/smith");

  await expect(
    page.getByRole("heading", { name: "מרכז הבקרה התפעולי" }),
  ).toBeVisible();
  await expect(page.getByText("Smith Agent כבוי כרגע")).toBeVisible();
  await expect(
    page.getByText("משתמשים פעילים").locator("..").getByText("5"),
  ).toBeVisible();
  await expect(
    page.getByText("ממתינים לאישור").locator("..").getByText("2"),
  ).toBeVisible();
  await expect(
    page.getByText("משימות").locator("..").getByText("12"),
  ).toBeVisible();
  await expect(page.getByText("640ms").first()).toBeVisible();
  await expect(page.getByText("ai.failure")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "בדיקות מערכת" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "בדוק Database" }),
  ).toBeVisible();
  await expect(
    page.getByText("Preview אוטונומי ו־ProductionExecutor כבויים."),
  ).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test("manual diagnostic reports real running and result state", async ({
  page,
}) => {
  await mockControlCenter(page);
  await page.route("**/api/admin/diagnostics/database", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        check: "database",
        status: "passed",
        summary: "מסד הנתונים זמין ומגיב.",
        checkedAt: "2026-09-12T12:00:00.000Z",
        durationMs: 21,
        details: { userRoleRows: 9 },
      }),
    });
  });
  await page.goto("/admin/smith");
  await page.getByRole("button", { name: "בדוק Database" }).click();
  await expect(page.getByRole("button", { name: "מריץ בדיקה…" })).toBeVisible();
  await expect(page.getByText("מסד הנתונים זמין ומגיב.")).toBeVisible();
  await expect(page.getByText("21ms")).toBeVisible();
});

test("mobile navigation remains touch reachable", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "mobile project only");
  await mockControlCenter(page);
  await page.goto("/admin/smith");
  const menu = page.getByRole("button", { name: "פתיחת ניווט" });
  await menu.click();
  await expect(
    page.getByRole("navigation", { name: "ניווט מרכז הבקרה" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "בדיקות מערכת" })).toBeVisible();
});
