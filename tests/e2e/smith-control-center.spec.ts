import { expect, test, type Page } from "@playwright/test";

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
      series: [],
      recent: [
        {
          id: "recent-1",
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
      medianLatencyMs: 610,
      p95LatencyMs: null,
      latencySampleCount: 8,
      successfulCallsWithRetry: 1,
      retryMetadataSampleCount: 8,
      failureCodes: { unknown: 2 },
      recentFailures: [
        {
          createdAt: "2026-09-12T12:00:00.000Z",
          code: "unknown",
          status: null,
          latencyMs: 900,
          message: null,
          model: null,
        },
      ],
      models: [],
      lastTestedAt: "2026-09-12T12:00:00.000Z",
      lastSuccessAt: "2026-09-12T11:50:00.000Z",
      lastFailureAt: "2026-09-12T12:00:00.000Z",
      windowDays: 30,
      sampleLimit: 500,
      sampleTruncated: false,
      latencyScope: "application_decision_preparation",
    },
    "/api/admin/incidents": {
      occurrenceCount: 3,
      categoryCount: 2,
      unresolvedCount: 1,
      incidents: [
        {
          id: "ai.failure",
          eventType: "ai.failure",
          title: "כשל בעיבוד AI",
          subsystem: "ai",
          severity: "error",
          firstSeen: "2026-09-11T12:00:00.000Z",
          lastSeen: "2026-09-12T12:00:00.000Z",
          occurrenceCount: 2,
          latestCode: "unknown",
          latestMessage: null,
          latestLatencyMs: 900,
          status: "unresolved",
          resolutionEvidenceAt: null,
        },
      ],
      windowDays: 7,
      sampleLimit: 1000,
      sampleTruncated: false,
      generatedAt: "2026-09-12T12:00:00.000Z",
    },
    "/api/admin/tasks": { total: 12, byStatus: { open: 8, done: 4 } },
    "/api/admin/users": {
      users: [
        {
          id: "u1",
          email: "pending@example.com",
          emailConfirmed: false,
          createdAt: "2026-09-11T12:00:00.000Z",
          lastSignInAt: null,
          role: "user",
          approved: false,
        },
      ],
    },
    "/api/admin/activity?limit=100": {
      events: [
        {
          id: "event-1",
          event_type: "admin.access.changed",
          created_at: "2026-09-12T12:00:00.000Z",
        },
        {
          id: "event-2",
          event_type: "ai.failure",
          created_at: "2026-09-12T12:00:00.000Z",
        },
      ],
    },
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
  await expect(page.getByText("OFF — deliberate")).toBeVisible();
  await expect(
    page.getByText("משתמשים פעילים").locator("..").getByText("5"),
  ).toBeVisible();
  await expect(
    page.getByText("ממתינים לאישור").locator("..").getByText("2"),
  ).toBeVisible();
  await expect(
    page.getByText("משימות").locator("..").getByText("12"),
  ).toBeVisible();
  await expect(page.getByText("זמן הכנת החלטת AI")).toBeVisible();
  await expect(page.getByText("640ms").first()).toBeVisible();
  await expect(
    page.locator(".smith-summary-card").filter({ hasText: "תקלות אחרונות" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "בדיקות מערכת" }),
  ).toBeVisible();
  await expect(
    page.getByText("Preview אוטונומי ו־ProductionExecutor כבויים במכוון."),
  ).toBeVisible();
});

test("summary cards open operational detail drawers", async ({ page }) => {
  await mockControlCenter(page);
  await page.goto("/admin/smith");
  await page.getByRole("button", { name: /זמן הכנת החלטת AI/ }).click();
  await expect(page.getByRole("heading", { name: "ביצועי AI" })).toBeVisible();
  await expect(page.getByText("הכנת החלטה בצד השרת")).toBeVisible();
  await page.getByRole("button", { name: "סגירת פרטים" }).click();
  await page.getByRole("button", { name: /תקלות אחרונות/ }).click();
  await expect(page.locator("#operational-drawer-title")).toHaveText(
    "תקלות אחרונות",
  );
  await expect(page.getByText("כשל בעיבוד AI", { exact: true })).toBeVisible();
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
        status: "pass",
        summary: "מסד הנתונים זמין ומגיב.",
        startedAt: "2026-09-12T12:00:00.000Z",
        completedAt: "2026-09-12T12:00:00.021Z",
        durationMs: 21,
        warnings: [],
        details: { userRoleRows: 9 },
      }),
    });
  });
  await page.goto("/admin/smith");
  await page.getByRole("button", { name: "הרץ בדיקה" }).first().click();
  await expect(page.getByRole("button", { name: "מריץ…" })).toBeVisible();
  await expect(page.getByText("מסד הנתונים זמין ומגיב.")).toBeVisible();
  await expect(page.getByText("21ms")).toBeVisible();
  await expect(page.getByText("PASS").first()).toBeVisible();
});

test("events route is a real filtered view", async ({ page }) => {
  await mockControlCenter(page);
  await page.goto("/admin/smith/events");
  await expect(
    page.getByRole("heading", { name: "אירועים ותקלות אחרונות" }).first(),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "שגיאות" })).toBeVisible();
  await page.getByRole("button", { name: "שגיאות" }).click();
  await expect(page.getByText("קריאת AI נכשלה")).toBeVisible();
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
