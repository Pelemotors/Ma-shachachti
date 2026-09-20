import assert from "node:assert/strict";
import { test } from "node:test";
import { containsRawSecret, redactValue } from "../utils/redact.ts";

test("redaction removes tokens passwords and keys", () => {
  const redacted = redactValue({
    authorization: "Bearer abc.def.ghi",
    password: "secret-pass",
    nested: { access_token: "tok", note: "ok" },
    text: "Authorization Bearer eyJabc.def.ghi-signature",
  }) as Record<string, unknown>;
  assert.equal(redacted.authorization, "[REDACTED]");
  assert.equal(redacted.password, "[REDACTED]");
  assert.equal((redacted.nested as { access_token: string }).access_token, "[REDACTED]");
  assert.match(String(redacted.text), /\[REDACTED\]/);
  assert.equal(containsRawSecret({ authorization: "Bearer keep" }), true);
  assert.equal(containsRawSecret({ authorization: "[REDACTED]" }), false);
});
