import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  forgotPasswordNeutralMessage,
  mapAuthErrorMessage,
  signupNeedsEmailVerification,
  validateNewPassword,
  verificationEmailSentMessage,
} from "../lib/auth/email-auth.ts";

test("password validation requires match and minimum length", () => {
  assert.match(validateNewPassword("123", "123") || "", /לפחות/);
  assert.match(validateNewPassword("123456", "123457") || "", /תואמות/);
  assert.equal(validateNewPassword("123456", "123456"), null);
});

test("signupNeedsEmailVerification detects unconfirmed signup", () => {
  assert.equal(signupNeedsEmailVerification(null, { email_confirmed_at: null }), true);
  assert.equal(
    signupNeedsEmailVerification({ access_token: "x" }, { email_confirmed_at: null }),
    false,
  );
  assert.equal(
    signupNeedsEmailVerification(null, { email_confirmed_at: "2026-01-01" }),
    false,
  );
});

test("mapAuthErrorMessage covers confirmation and recovery cases", () => {
  assert.match(
    mapAuthErrorMessage({ message: "Email not confirmed" }) || "",
    /לאמת/,
  );
  assert.match(
    mapAuthErrorMessage({ message: "Token has expired or is invalid" }) || "",
    /פג תוקף|אינו תקין/,
  );
  assert.match(
    mapAuthErrorMessage({ code: "over_email_send_rate_limit" }) || "",
    /יותר מדי/,
  );
});

test("forgot-password copy does not enumerate accounts", () => {
  const msg = forgotPasswordNeutralMessage();
  assert.match(msg, /אם קיים חשבון/);
  assert.doesNotMatch(msg, /לא נמצא|לא קיים/);
});

test("verification copy is Hebrew and actionable", () => {
  assert.match(verificationEmailSentMessage(), /מייל לאימות/);
});

test("auth routes and login form wire Resend-ready redirects", () => {
  const login = readFileSync(new URL("../components/login-form.tsx", import.meta.url), "utf8");
  assert.match(login, /resetPasswordForEmail/);
  assert.match(login, /auth\/reset-password/);
  assert.match(login, /auth\/callback/);
  assert.match(login, /resend\(/);
  assert.match(login, /confirmPassword|אימות סיסמה/);
  assert.match(login, /forgotPasswordNeutralMessage/);

  const reset = readFileSync(
    new URL("../app/auth/reset-password/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(reset, /updateUser/);
  assert.match(reset, /exchangeCodeForSession/);

  const callback = readFileSync(
    new URL("../app/auth/callback/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(callback, /exchangeCodeForSession/);

  const browser = readFileSync(
    new URL("../lib/supabase-browser.ts", import.meta.url),
    "utf8",
  );
  assert.match(browser, /detectSessionInUrl:\s*true/);
  assert.match(browser, /flowType:\s*"pkce"/);
});

test("hebrew email templates exist for confirmation and recovery", () => {
  const confirmation = readFileSync(
    new URL("../supabase-email-templates/confirmation.html", import.meta.url),
    "utf8",
  );
  const recovery = readFileSync(
    new URL("../supabase-email-templates/recovery.html", import.meta.url),
    "utf8",
  );
  assert.match(confirmation, /ConfirmationURL/);
  assert.match(confirmation, /dir="rtl"/);
  assert.match(recovery, /ConfirmationURL/);
  assert.match(recovery, /איפוס/);
});
