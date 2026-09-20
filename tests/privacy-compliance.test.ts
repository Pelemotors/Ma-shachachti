import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";
import { resumePathAfterAuth } from "../lib/native/deep-links.ts";
import {
  readyTimes,
  isAudioRetentionDue,
} from "../lib/audio/recording-bank-helpers.ts";
import { sanitizeTelemetryMetadata } from "../lib/observability.ts";
import {
  MIC_DISCLOSURE_TITLE,
  MIC_DISCLOSURE_BODY,
} from "../lib/privacy/mic-disclosure.ts";

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("privacy pages exist as public Next routes", () => {
  assert.ok(existsSync(new URL("../app/privacy/page.tsx", import.meta.url)));
  assert.ok(
    existsSync(new URL("../app/account-deletion/page.tsx", import.meta.url)),
  );
  const privacy = read("app/privacy/page.tsx");
  const deletion = read("app/account-deletion/page.tsx");
  assert.match(privacy, /מדיניות פרטיות – מה שכחתי\?/);
  assert.match(privacy, /2026-09-20/);
  assert.match(privacy, /noreply@mashachachti\.co\.il/);
  assert.match(privacy, /7 ימים/);
  assert.match(privacy, /OpenAI/);
  assert.match(privacy, /Pelemotors/);
  assert.doesNotMatch(privacy, /SUPABASE_SERVICE_ROLE|service_role/);
  assert.match(deletion, /מה שכחתי\?/);
  assert.match(deletion, /AccountDeletionClient/);
  assert.doesNotMatch(deletion, /redirect\(["']/);
});

test("login resume allows account-deletion public path", () => {
  assert.equal(
    resumePathAfterAuth("/account-deletion"),
    "/account-deletion",
  );
  assert.equal(
    resumePathAfterAuth("https://mashachachti.co.il/privacy"),
    "/privacy",
  );
});

test("account deletion route uses full purge helper", () => {
  const route = read("app/api/account/delete/route.ts");
  const helper = read("lib/account/delete-account.ts");
  assert.match(route, /deleteUserAccountFully/);
  assert.match(route, /authorizeIdentity/);
  assert.match(helper, /purgeUserRecordingObjects/);
  assert.match(helper, /auth\.admin\.deleteUser/);
  assert.match(helper, /account_audit/);
  assert.match(helper, /storageRemoved/);
});

test("raw audio retention is 7 days and cron-backed", () => {
  const now = new Date("2026-09-18T12:00:00.000Z");
  const times = readyTimes(now);
  assert.equal(
    times.delete_after,
    new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  );
  assert.equal(
    isAudioRetentionDue(
      {
        status: "ready",
        storage_path: "u/r.webm",
        delete_after: times.delete_after,
      },
      new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000 + 1),
    ),
    true,
  );
  const cron = read("app/api/cron/recordings/route.ts");
  assert.match(cron, /cleanupExpiredRecordings/);
});

test("push lock-screen body is generic (no task title)", () => {
  const source = read("lib/reminder-dispatch.ts");
  assert.match(source, /יש לך תזכורת ממתינה/);
  assert.doesNotMatch(
    source,
    /body:\s*task\.title/,
  );
});

test("microphone disclosure copy and gate exist", () => {
  assert.match(MIC_DISCLOSURE_TITLE, /מיקרופון/);
  assert.match(MIC_DISCLOSURE_BODY, /רק כאשר אתה בוחר להקליט/);
  const hook = read("hooks/use-device-permissions.ts");
  const recorder = read("hooks/use-audio-recorder.ts");
  assert.match(hook, /ensureMicDisclosureAccepted/);
  assert.match(recorder, /ensureMicDisclosureAccepted/);
});

test("settings expose privacy and account deletion links", () => {
  const settings = read("components/settings-panel.tsx");
  assert.match(settings, /mashachachti\.co\.il\/privacy/);
  assert.match(settings, /mashachachti\.co\.il\/account-deletion/);
});

test("telemetry sanitizer redacts sensitive keys", () => {
  const cleaned = sanitizeTelemetryMetadata({
    platform: "android",
    access_token: "secret",
    password: "x",
    email: "a@b.c",
    transcript: "private speech",
    audio: "blob",
    ok: true,
  });
  assert.equal(cleaned.platform, "android");
  assert.equal(cleaned.ok, true);
  assert.equal(cleaned.access_token, undefined);
  assert.equal(cleaned.password, undefined);
  assert.equal(cleaned.email, undefined);
  assert.equal(cleaned.transcript, undefined);
  assert.equal(cleaned.audio, undefined);
});

test("privacy docs deliverables exist", () => {
  for (const path of [
    "docs/privacy/privacy-target.md",
    "docs/privacy/policy-obligations.md",
    "docs/privacy/processor-inventory.md",
    "docs/privacy/data-retention-matrix.md",
    "docs/privacy/data-flow-map.md",
    "docs/privacy/android-permission-inventory.md",
    "docs/privacy/account-deletion-map.md",
    "docs/google-play-data-safety-audit.md",
  ]) {
    assert.ok(existsSync(new URL(`../${path}`, import.meta.url)), path);
  }
});

test("expo foundation blocks sensitive unused permissions", () => {
  const config = read("apps/mobile/app.config.ts");
  assert.match(config, /blockedPermissions/);
  assert.match(config, /READ_CONTACTS/);
  assert.match(config, /AD_ID/);
  const manifest = read(
    "apps/mobile/android/app/src/main/AndroidManifest.xml",
  );
  assert.match(manifest, /INTERNET/);
  assert.match(manifest, /RECORD_AUDIO/);
  assert.match(manifest, /AD_ID" tools:node="remove"/);
});

test("expo product screens are real CRUD not JSON dumps", () => {
  const home = read("apps/mobile/src/screens/FoundationHomeScreen.tsx");
  assert.match(home, /ProductShell/);
  const shell = read("apps/mobile/src/navigation/ProductShell.tsx");
  assert.match(shell, /TasksScreen/);
  assert.match(shell, /ChatScreen/);
  assert.match(shell, /BankScreen/);
  assert.match(shell, /PlanComposerScreen|DayPlanScreen/);
  assert.match(shell, /CalendarScreen/);
  assert.doesNotMatch(shell, /ApiListScreen/);
  const tasks = read("apps/mobile/src/screens/TasksScreen.tsx");
  assert.match(tasks, /listTasks/);
  assert.match(tasks, /completeTask/);
  const gate = read("apps/mobile/src/screens/FoundationGateScreen.tsx");
  assert.match(gate, /signInWithEmail/);
  assert.match(gate, /signIn\("google"\)/);
  assert.match(gate, /nativeOAuthHint/);
  assert.doesNotMatch(gate, /label="המשך עם Google"[\s\S]{0,120}onPress=\{\(\) => undefined\}/);
});

test("mobile privacy settings screen is real (not placeholder)", () => {
  const screen = read("apps/mobile/src/screens/PrivacySettingsScreen.tsx");
  assert.match(screen, /\/api\/account\/delete/);
  assert.match(screen, /mashachachti\.co\.il\/privacy/);
  assert.match(screen, /Linking\.openURL/);
  assert.doesNotMatch(screen, /TODO|placeholder|בקרוב/i);
});
