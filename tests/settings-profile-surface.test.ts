import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../", import.meta.url);

function read(rel: string) {
  return readFileSync(new URL(rel, root), "utf8");
}

test("Home avatar is pressable and opens Settings (geometry preserved)", () => {
  const header = read("apps/mobile/src/screens/home-v4/HomeHeader.tsx");
  const home = read("apps/mobile/src/screens/home-v4/HomeV4Screen.tsx");
  assert.match(header, /onAvatar/);
  assert.match(header, /accessibilityLabel="הגדרות ופרופיל"/);
  assert.match(header, /Math\.max\(40 \* s, 44\)/);
  assert.match(home, /onAvatar=\{\(\) => onOpen\("settings"\)\}/);
  // Geometry: greeting + bell stay; avatar not moved to a new layout region.
  assert.match(header, /styles\.row/);
  assert.match(header, /minHeight: 80 \* s/);
});

test("ProductShell wires settings hub and children without second nav library", () => {
  const shell = read("apps/mobile/src/navigation/ProductShell.tsx");
  assert.match(shell, /SettingsHubScreen/);
  assert.match(shell, /ProfileSettingsScreen/);
  assert.match(shell, /NotificationSettingsScreen/);
  assert.match(shell, /HouseholdScreen/);
  assert.match(shell, /HelpSettingsScreen/);
  assert.match(shell, /"settings"/);
  assert.match(shell, /notificationSettings/);
  // Inbox notifications remain distinct from settings permissions screen.
  assert.match(shell, /HomeNotificationsSheet/);
  assert.doesNotMatch(shell, /createNativeStackNavigator|@react-navigation\/stack/);
});

test("Settings hub uses warm brand tokens and required rows", () => {
  const hub = read("apps/mobile/src/screens/settings/SettingsHubScreen.tsx");
  const theme = read("apps/mobile/src/screens/settings/settingsTheme.ts");
  assert.match(theme, /#FBF8F3/);
  assert.match(theme, /#9B7658/);
  assert.match(theme, /#B85C52/);
  assert.match(hub, /הגדרות/);
  assert.match(hub, /התראות/);
  assert.match(hub, /לוח שנה/);
  assert.match(hub, /משק בית/);
  assert.match(hub, /פרטיות ואבטחה/);
  assert.match(hub, /עזרה ותמיכה/);
  assert.match(hub, /יציאה מהחשבון/);
  assert.match(hub, /לצאת מהחשבון\?/);
  assert.match(hub, /onOpen\("profile"\)/);
});

test("Profile V1 is name + email + avatar only (no phone/about)", () => {
  const profile = read("apps/mobile/src/screens/settings/ProfileSettingsScreen.tsx");
  assert.match(profile, /הפרופיל שלי/);
  assert.match(profile, /שם מלא/);
  assert.match(profile, /כתובת אימייל/);
  assert.match(profile, /שמירת פרטים/);
  assert.match(profile, /uploadAvatar/);
  assert.match(profile, /manipulateAsync/);
  assert.match(profile, /512/);
  assert.doesNotMatch(profile, /טלפון|עליי|phone_e164|about_me/);
  assert.match(profile, /readOnly|מנוהל דרך ההתחברות/);
});

test("Avatar persists via profile path, not task snapshot metadata", () => {
  const api = read("apps/mobile/src/api/profile.ts");
  const route = read("app/api/profile/avatar/route.ts");
  const migration = read("database/migrations/20260922_profile_avatar.sql");
  const avatar = read("apps/mobile/src/components/UserAvatar.tsx");
  assert.match(api, /avatar_path/);
  assert.match(api, /never persist into task rows/i);
  assert.match(route, /from\("avatars"\)/);
  assert.match(route, /avatar_path: path/);
  assert.match(migration, /avatar_path/);
  assert.match(migration, /avatars\/\{user_id\}/);
  assert.match(avatar, /size = "settings"/);
  assert.match(avatar, /entity: 24/);
});

test("Notification settings: honest OS permission + devices registration", () => {
  const screen = read("apps/mobile/src/screens/NotificationSettingsScreen.tsx");
  const reg = read("apps/mobile/src/notifications/registerDevice.ts");
  assert.match(screen, /getPermissionsAsync/);
  assert.match(screen, /requestPermissionsAsync/);
  assert.match(screen, /openAppNotificationSettings|Linking\.openSettings/);
  assert.match(screen, /masterOn && perm === "granted"/);
  assert.match(screen, /registerNativePushDevice/);
  assert.match(screen, /resolveNativePushToken/);
  assert.match(reg, /installationId/);
  assert.match(reg, /pushPermission/);
  assert.match(reg, /\/api\/devices/);
  const life = read("apps/mobile/src/notifications/pushLifecycle.ts");
  assert.match(life, /getDevicePushTokenAsync/);
  assert.match(life, /getPermissionsAsync/);
  const auth = read("apps/mobile/src/auth/AuthContext.tsx");
  assert.match(auth, /revokeNativePushRegistration/);
  assert.match(auth, /bootstrapNativePush/);
});

test("Calendar settings reuse existing Google OAuth path", () => {
  const cal = read("apps/mobile/src/screens/CalendarScreen.tsx");
  assert.match(cal, /לוח שנה/);
  assert.match(cal, /\/api\/calendar\/oauth\/start/);
  assert.match(cal, /WebBrowser\.openAuthSessionAsync/);
  assert.match(cal, /action: "disconnect"/);
  assert.doesNotMatch(cal, /Microsoft|microsoft/);
});

test("Home data prefers profile avatar_url over OAuth metadata snapshot", () => {
  const data = read("apps/mobile/src/screens/home-v4/useHomeV4Data.ts");
  assert.match(data, /profile\.avatar_url/);
  assert.match(data, /getProfile/);
});
