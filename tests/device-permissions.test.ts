import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  mapGetUserMediaError,
  queryNotificationStatus,
  requestMicrophonePermission,
  requestNotificationPermission,
} from "../hooks/use-device-permissions";

test("Permissions API state maps via query helpers when Notification exists", () => {
  const original = globalThis.Notification;
  // @ts-expect-error test stub
  globalThis.Notification = { permission: "granted" };
  assert.equal(queryNotificationStatus(), "granted");
  // @ts-expect-error test stub
  globalThis.Notification = { permission: "denied" };
  assert.equal(queryNotificationStatus(), "denied");
  // @ts-expect-error test stub
  globalThis.Notification = { permission: "default" };
  assert.equal(queryNotificationStatus(), "prompt");
  globalThis.Notification = original;
});

test("DOMException maps to microphone error codes", () => {
  assert.deepEqual(
    mapGetUserMediaError(
      Object.assign(new DOMException("denied", "NotAllowedError"), {}),
    ),
    { status: "denied", code: "microphone_denied" },
  );
  assert.deepEqual(
    mapGetUserMediaError(new DOMException("missing", "NotFoundError")),
    { status: "unavailable", code: "microphone_unavailable" },
  );
  assert.deepEqual(
    mapGetUserMediaError(new DOMException("busy", "NotReadableError")),
    { status: "unavailable", code: "microphone_busy" },
  );
});

test("requestMicrophonePermission returns unsupported without getUserMedia", async () => {
  const nav = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { mediaDevices: undefined },
  });
  const result = await requestMicrophonePermission();
  assert.equal(result.status, "unsupported");
  assert.equal(result.code, "microphone_unsupported");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: nav,
  });
});

test("requestNotificationPermission returns unsupported without Notification", async () => {
  const original = globalThis.Notification;
  // @ts-expect-error delete for test
  delete globalThis.Notification;
  const result = await requestNotificationPermission();
  assert.equal(result.status, "unsupported");
  assert.equal(result.code, "notification_unsupported");
  globalThis.Notification = original;
});

test("P43 reminder controller does not pair mic+notification in one function", () => {
  const src = readFileSync(
    join(process.cwd(), "hooks/use-reminder-controller.ts"),
    "utf8",
  );
  assert.equal(src.includes("requestIndependentPermissions"), false);
  assert.equal(src.includes("Promise.allSettled"), false);
  assert.equal(src.includes("requestMicPermissionOnly"), false);
  assert.ok(src.includes("requestNotificationPermission"));
  assert.ok(src.includes("enablePush"));
});

test("P43 home bell only navigates to reminders", () => {
  const src = readFileSync(
    join(process.cwd(), "components/home-app.tsx"),
    "utf8",
  );
  assert.equal(src.includes("requestIndependentPermissions"), false);
  assert.match(src, /onClick=\{\(\) => navigate\("reminders"\)\}/);
});
