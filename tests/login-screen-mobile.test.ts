import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../", import.meta.url);

function read(rel: string) {
  return readFileSync(new URL(rel, root), "utf8");
}

test("warm login screen preserves auth and removes guest CTA", () => {
  const gate = read("apps/mobile/src/screens/FoundationGateScreen.tsx");
  const session = read("apps/mobile/src/auth/session.ts");
  assert.match(gate, /login-hero-warm-entry\.jpg/);
  assert.match(gate, /מה שכחתי\?/);
  assert.match(gate, /הבית שלך, היום שלך/);
  assert.match(gate, /זוכרים יחד את מה שחשוב באמת/);
  assert.match(gate, /התחבר/);
  assert.match(gate, /התחבר עם Google/);
  assert.match(gate, /שכחת סיסמה/);
  assert.match(gate, /signInWithEmail/);
  assert.match(gate, /signIn\("google"\)/);
  assert.match(gate, /requestPasswordReset/);
  assert.match(gate, /nativeOAuthHint/);
  assert.match(gate, /#FBF6EE/);
  assert.match(gate, /#BC6E45/);
  assert.doesNotMatch(gate, /המשך ללא חשבון|המשך לצפייה|enterPreview/);
  assert.match(session, /resetPasswordForEmail/);
  assert.match(session, /signInWithPassword/);
  assert.ok(
    existsSync(new URL("apps/mobile/assets/auth/login-hero-warm-entry.jpg", root)),
  );
});
