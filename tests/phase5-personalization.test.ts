import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  extractLegacyProfile,
  onboardingUpdateSchema,
  profileUpdateSchema,
} from "../lib/user-profile.ts";
import { buildInstructions } from "../lib/agent/turn.ts";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("profile migration records audit rationale and safely copies legacy profile only", () => {
  const sql = read("../database/migrations/20260912_lean_user_profiles.sql");
  assert.match(sql, /auth\.user_metadata has no Lean profile fields/);
  assert.match(sql, /app_states\.data\.profile/);
  assert.match(sql, /to_jsonb\(state_row\)/);
  assert.match(sql, /-> 'data' -> 'profile'/);
  assert.match(sql, /row_json ->> 'owner_id'/);
  assert.match(sql, /profile ->> 'themeMode' = 'fixed'/);
  assert.match(sql, /profile ->> 'fixedTheme'/);
  assert.match(sql, /jsonb_typeof\(legacy\.profile -> 'name'\) = 'string'/);
  assert.match(sql, /on conflict \(user_id\) do nothing/);
  assert.doesNotMatch(sql, /update\s+public\.app_states|delete\s+from\s+public\.app_states/i);
  assert.doesNotMatch(sql, /profile\s*->>?\s*'autoApply'|household|persona/i);
});

test("pure legacy extraction handles actual app_states row shape", () => {
  const rows = [
    {
      owner_id: "11111111-1111-4111-8111-111111111111",
      revision: 7,
      updated_at: "2026-09-11T20:00:00Z",
      data: {
        profile: {
          name: " דנה ",
          addressAs: "feminine",
          onboarded: true,
          themeMode: "fixed",
          fixedTheme: "autumn",
          autoApply: true,
        },
      },
    },
    {
      owner_id: "22222222-2222-4222-8222-222222222222",
      data: {
        profile: {
          name: "רוני",
          addressAs: "feminine",
          onboarded: true,
          themeMode: "auto",
          fixedTheme: "winter",
        },
      },
    },
    {
      owner_id: "33333333-3333-4333-8333-333333333333",
      data: {
        profile: {
          name: "נועה",
          addressAs: "feminine",
          onboarded: true,
          themeMode: "fixed",
          fixedTheme: "spring",
        },
      },
    },
  ];
  const extracted = rows.map(extractLegacyProfile);
  assert.deepEqual(
    extracted.map((profile) => profile.user_id),
    rows.map((row) => row.owner_id),
  );
  assert.deepEqual(extracted[0], {
    user_id: rows[0].owner_id,
    display_name: "דנה",
    address_style: "feminine",
    onboarding_completed: true,
    appearance_mode: "season",
    appearance_season: "autumn",
  });
  assert.equal(extracted[1].appearance_mode, "auto");
  assert.equal(extracted[1].appearance_season, null);
  assert.equal(extracted[2].appearance_season, "spring");
  assert.deepEqual(extractLegacyProfile({ owner_id: 4, data: { profile: [] } }), {
    user_id: null,
    display_name: null,
    address_style: "neutral",
    onboarding_completed: false,
    appearance_mode: "auto",
    appearance_season: null,
  });
});

test("profile table is minimal and protected by ownership RLS", () => {
  const sql = read("../database/migrations/20260912_lean_user_profiles.sql");
  assert.match(sql, /user_id uuid primary key references auth\.users/);
  assert.match(sql, /address_style in \('neutral', 'masculine', 'feminine'\)/);
  assert.match(sql, /appearance_mode in \('auto', 'season'\)/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /auth\.uid\(\)\) = user_id/g);
  assert.match(sql, /revoke all on public\.user_profiles from anon/);
});

test("profile validation bounds canonical edits and keeps onboarding skippable", () => {
  assert.equal(
    profileUpdateSchema.safeParse({
      display_name: "רוני",
      address_style: "feminine",
      appearance_mode: "auto",
      appearance_season: null,
    }).success,
    true,
  );
  assert.equal(
    profileUpdateSchema.safeParse({
      display_name: "x".repeat(81),
      address_style: "admin",
      appearance_mode: "season",
      appearance_season: null,
    }).success,
    false,
  );
  assert.equal(onboardingUpdateSchema.safeParse({ action: "skip" }).success, true);
  assert.equal(
    onboardingUpdateSchema.safeParse({
      action: "complete",
      display_name: "דנה",
      address_style: "feminine",
    }).success,
    true,
  );
});

test("profile and memory endpoints scope every mutation to the authenticated owner", () => {
  const profile = read("../app/api/profile/route.ts");
  const memories = read("../app/api/memories/route.ts");
  assert.match(profile, /user_id: userId/);
  assert.match(profile, /\.eq\("user_id", userId\)/);
  assert.match(memories, /\.eq\("user_id", userId\)/g);
  assert.match(memories, /z\.string\(\)\.uuid\(\)/);
  assert.doesNotMatch(`${profile}\n${memories}`, /user_metadata|app_states/);
});

test("chat loads same-owner profile and limits it to conversational addressing", () => {
  const route = read("../app/api/chat/route.ts");
  const loader = read("../lib/user-profile.ts");
  assert.match(route, /loadAgentProfile\(db, userId\)/);
  assert.match(route, /new HttpError\(503, "לא הצלחנו לטעון את הקשר המשתמש לשיחה\."\)/);
  assert.match(loader, /\.from\("user_profiles"\)/);
  assert.match(loader, /\.eq\("user_id", userId\)/);
  assert.doesNotMatch(`${route}\n${loader}`, /user_metadata/);

  const addressed = buildInstructions({
    tasks: [],
    memory: [],
    profile: { display_name: "דנה", address_style: "feminine" },
  });
  assert.match(addressed, /"display_name":"דנה"/);
  assert.match(addressed, /"address_style":"feminine"/);
  assert.match(addressed, /רק לניסוח שיחתי טבעי/);
  assert.match(addressed, /אין להסיק מהם הרשאה/);

  const neutral = buildInstructions({ tasks: [], memory: [] });
  assert.match(neutral, /"display_name":null/);
  assert.match(neutral, /"address_style":"neutral"/);
});

test("memory learning exposes sources and explicit seen metadata without classifiers", () => {
  const api = read("../app/api/memories/route.ts");
  const ui = read("../components/memory-learning.tsx");
  assert.match(api, /action: z\.literal\("mark_seen"\)/);
  assert.match(api, /\.update\(\{ seen_at: now \}\)/);
  assert.match(api, /source: "user"/);
  assert.match(ui, /agent: "נלמד בשיחה"/);
  assert.match(ui, /legacy: "יובא מהגרסה הקודמת"/);
  assert.match(ui, /new-badge/);
  assert.match(ui, /window\.confirm/);
  assert.doesNotMatch(`${api}\n${ui}`, /classifier|confidence.*[<{]|raw JSON/i);
});

test("onboarding persists complete and skip and migrated users are gated out", () => {
  const api = read("../app/api/profile/route.ts");
  const onboarding = read("../components/onboarding.tsx");
  const app = read("../components/chat-app.tsx");
  assert.match(api, /onboarding_completed_at: existing\.onboarding_completed_at \?\? now/);
  assert.match(onboarding, /"complete" \| "skip"/);
  assert.match(onboarding, /דילוג לעכשיו/);
  assert.match(app, /!profile\.onboarding_completed_at/);
});

test("chat history is a dedicated accessible paginated owner-only drawer with URL sync", () => {
  const drawer = read("../components/previous-chats.tsx");
  const route = read("../app/api/chat/sessions/route.ts");
  const sessions = read("../lib/chat-sessions.ts");
  const app = read("../components/chat-app.tsx");
  assert.match(drawer, /role="dialog"/);
  assert.match(drawer, /aria-modal="true"/);
  assert.match(drawer, /event\.key === "Escape"/);
  assert.match(drawer, /offset=\$\{sessions\.length\}/);
  assert.match(drawer, /טוען שיחות|אין עדיין שיחות|לא הצלחנו/);
  assert.match(route, /limit: pageSize/);
  assert.match(sessions, /\.eq\("user_id", userId\)/g);
  assert.match(app, /navigate\(\{ view: "chat", sessionId: nextSessionId \}\)/);
  assert.doesNotMatch(read("../components/settings-panel.tsx"), /PreviousChats|ChatHistoryDrawer/);
});
