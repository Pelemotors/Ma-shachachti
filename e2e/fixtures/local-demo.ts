import { expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

export const LOCAL_STORAGE_KEY = "ma-shachachti:local:v1";

const STAMP = "2026-09-07T10:00:00.000+03:00";

export type SeedTask = {
  title: string;
  categoryId?: string;
  priority?: number;
  kind?: "task" | "idea";
  routineId?: string | null;
};

export type SeedRoutine = {
  id?: string;
  title: string;
  categoryId?: string;
  priority?: number;
};

/** Minimal AppState JSON for localStorage — avoids importing lib/engine (catalog.json ESM). */
export function buildLocalState(
  tasks: SeedTask[] = [],
  routines: SeedRoutine[] = [],
) {
  return {
    schemaVersion: 2,
    profile: {
      name: "בדיקת E2E",
      addressAs: "feminine",
      rooms: 3,
      bathrooms: 1,
      children: 0,
      garden: false,
      pets: false,
      car: false,
      dishwasher: false,
      dryer: false,
      aiConsent: false,
      autoApply: true,
      onboarded: true,
      timezone: "Asia/Jerusalem",
      quietStart: 22,
      quietEnd: 7,
      themeMode: "auto",
      fixedTheme: "spring",
    },
    tasks: tasks.map((t) => ({
      id: randomUUID(),
      title: t.title,
      categoryId: t.categoryId ?? "unclassified",
      detailTypeId: null,
      classification: {
        source: "user",
        confidence: "high",
        userOverride: false,
      },
      enrichmentStatus: "done",
      kind: t.kind ?? "task",
      status: "open",
      createdAt: STAMP,
      updatedAt: STAMP,
      dueAt: null,
      preferredWindow: null,
      hiddenUntil: null,
      startedAt: null,
      workMinutes: 15,
      waitMinutes: 0,
      effort: 2,
      priority: t.priority ?? 1,
      dependsOn: [],
      steps: [],
      templateId: null,
      recurrenceDays: null,
      occurrenceOf: null,
      routineId: t.routineId ?? null,
      notes: "",
      completedAt: null,
      actualWorkMinutes: null,
      durationFeedbackAskedAt: null,
      relatedMemberIds: [],
      homeAreaIds: [],
    })),
    routines: routines.map((r) => ({
      id: r.id ?? randomUUID(),
      title: r.title,
      status: "active",
      categoryId: r.categoryId ?? "unclassified",
      detailTypeId: null,
      schedule: { frequency: "daily", interval: 1 },
      timeOfDay: "any",
      atTime: null,
      workMinutes: 15,
      effort: 2,
      priority: r.priority ?? 1,
      notes: "",
      sourceFactId: null,
      relatedMemberIds: [],
      homeAreaIds: [],
      createdAt: STAMP,
      updatedAt: STAMP,
      lastMaterializedDate: "2026-09-07",
    })),
    facts: [],
    shopping: [],
    reminders: [],
    messages: [],
    excludedTemplates: [],
    planning: { today: null, plan: null },
    events: [],
    members: [],
    suggestionHistory: [],
    learning: [],
    compactedMemory: {
      facts: [],
      preferences: [],
      patterns: [],
      updatedAt: null,
      lifeAdminWindow: {
        preferredStartMinutes: null,
        preferredEndMinutes: null,
        confidence: 0,
        samples: 0,
      },
    },
    operations: [],
    homeAreas: [],
    firstScan: { status: "not_started", completedAt: null, session: null },
  };
}

export type LocalSeedState = ReturnType<typeof buildLocalState>;

/** Write seed once (not via addInitScript — that would wipe defer on reload). */
export async function seedLocalState(page: Page, state: LocalSeedState) {
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(
    ({ key, raw }) => {
      window.localStorage.setItem(key, raw);
    },
    { key: LOCAL_STORAGE_KEY, raw: JSON.stringify(state) },
  );
}

/** Open /app, enter clearly-labelled local demo, skip onboarding if shown. */
export async function openLocalDemo(page: Page, state?: LocalSeedState) {
  await page.goto("/app", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/app/, { timeout: 15_000 });
  if (state) await seedLocalState(page, state);
  const localBtn = page.getByRole("button", {
    name: /התנסות מקומית|הדגמה|מקומ|בלי חשבון/i,
  });
  await expect(localBtn.first()).toBeVisible({ timeout: 30_000 });
  await localBtn.first().click();
  const skipOnboarding = page.getByRole("button", {
    name: /אפשר גם להכיר בהמשך/i,
  });
  if (await skipOnboarding.count()) {
    await skipOnboarding.click();
  }
  await expect(page.getByText(/הדגמה במכשיר הזה/i)).toBeVisible({
    timeout: 15_000,
  });
}

export async function goHome(page: Page) {
  const home = page
    .getByRole("navigation", { name: /ניווט ראשי/i })
    .getByRole("button", { name: /הבית שלי/i });
  if (await home.count()) {
    await home.click();
    return;
  }
  await page
    .getByRole("button", { name: /הבית שלי|בית/i })
    .first()
    .click();
}

export async function openTasksDetailed(page: Page) {
  await page
    .getByRole("navigation", { name: /ניווט ראשי/i })
    .getByRole("button", { name: /^משימות$/i })
    .click();
  await page.getByRole("button", { name: /^מפורט$/i }).click();
}

export async function openKit(page: Page) {
  await goHome(page);
  const invite = page.getByRole("button", { name: /נכיר קצת את השגרה/i });
  if (await invite.count()) {
    await invite.click();
    return;
  }
  await openTasksDetailed(page);
  await page.getByRole("button", { name: /הצעות לבית/i }).click();
}

export async function openForgotten(page: Page) {
  await goHome(page);
  await page.getByRole("button", { name: /מה שכחתי\?/i }).click();
  await expect(page.getByText(/מה עלול ליפול בין הכיסאות/i)).toBeVisible();
}
