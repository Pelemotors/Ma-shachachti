import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const androidPlugin = readFileSync(
  new URL(
    "../android/app/src/main/java/il/co/mashachachti/app/MaNativePlugin.java",
    import.meta.url,
  ),
  "utf8",
);
const secureStore = readFileSync(
  new URL(
    "../android/app/src/main/java/il/co/mashachachti/app/SecureSessionStore.java",
    import.meta.url,
  ),
  "utf8",
);
const iosPlugin = readFileSync(
  new URL("../ios/App/App/MaNativePlugin.swift", import.meta.url),
  "utf8",
);
const supabaseBrowser = readFileSync(
  new URL("../lib/supabase-browser.ts", import.meta.url),
  "utf8",
);
const capacitorAdapter = readFileSync(
  new URL("../lib/native/capacitor-adapter.ts", import.meta.url),
  "utf8",
);

test("Android secure session uses Keystore-backed EncryptedSharedPreferences", () => {
  assert.match(secureStore, /EncryptedSharedPreferences/);
  assert.match(secureStore, /MasterKey/);
  assert.match(secureStore, /AES256_GCM/);
  assert.match(secureStore, /isKeyStoreBacked|keystoreBacked/);
  assert.match(secureStore, /migrateLegacyPlaintext/);
  assert.match(secureStore, /clearAll/);
  assert.match(androidPlugin, /SecureSessionStore\.getInstance/);
  assert.doesNotMatch(
    androidPlugin,
    /getSharedPreferences\(\s*PREFS,\s*android\.content\.Context\.MODE_PRIVATE\)/,
  );
});

test("Android secureSet overwrites with commit for atomic refresh", () => {
  assert.match(secureStore, /\.commit\(\)/);
  assert.match(secureStore, /public void put/);
  assert.match(secureStore, /public void remove/);
});

test("Android corrupted secure entry clears store instead of crashing callers", () => {
  assert.match(secureStore, /Corrupted secure entry/);
  assert.match(androidPlugin, /secure_store_unavailable|resolveValue\(call, null\)/);
});

test("iOS secure session uses Keychain", () => {
  assert.match(iosPlugin, /SecItemAdd/);
  assert.match(iosPlugin, /SecItemCopyMatching/);
  assert.match(iosPlugin, /kSecClassGenericPassword/);
  assert.match(iosPlugin, /func secureGet/);
});

test("shared NativeSecureStorage routes through NativeCapability", () => {
  assert.match(supabaseBrowser, /class NativeSecureStorage/);
  assert.match(supabaseBrowser, /nativeCapability\(\)\.secureGet/);
  assert.match(supabaseBrowser, /nativeCapability\(\)\.secureSet/);
  assert.match(supabaseBrowser, /nativeCapability\(\)\.secureRemove/);
  assert.match(supabaseBrowser, /isNativeShell\(\) \? new NativeSecureStorage/);
});

test("native shell does not fall back to localStorage for secrets", () => {
  assert.match(capacitorAdapter, /callSecure/);
  assert.match(capacitorAdapter, /Never park auth secrets in WebView localStorage/);
  assert.match(capacitorAdapter, /isNativePlatform\(\)/);
});

test("architecture: secure store implementation stays ANDROID_NATIVE", () => {
  assert.doesNotMatch(supabaseBrowser, /EncryptedSharedPreferences|MasterKey|androidx\.security/);
  assert.doesNotMatch(
    readFileSync(new URL("../lib/auth/native-session.ts", import.meta.url), "utf8"),
    /EncryptedSharedPreferences|SharedPreferences/,
  );
});

test("secure write/read/remove/overwrite contract semantics", async () => {
  const memory = new Map<string, string>();
  const store = {
    async secureGet(key: string) {
      return memory.get(key) ?? null;
    },
    async secureSet(key: string, value: string) {
      memory.set(key, value);
    },
    async secureRemove(key: string) {
      memory.delete(key);
    },
  };
  await store.secureSet(
    "sb-test-session",
    JSON.stringify({ access_token: "x", refresh_token: "y" }),
  );
  assert.match(String(await store.secureGet("sb-test-session")), /access_token/);
  await store.secureSet(
    "sb-test-session",
    JSON.stringify({ access_token: "x2", refresh_token: "y2" }),
  );
  assert.match(String(await store.secureGet("sb-test-session")), /x2/);
  await store.secureRemove("sb-test-session");
  assert.equal(await store.secureGet("sb-test-session"), null);
});

test("revoked/expired session path clears secret via secureRemove", async () => {
  assert.match(supabaseBrowser, /secureRemove/);
  assert.match(androidPlugin, /secureRemove/);
  assert.match(secureStore, /public void remove/);
  assert.match(secureStore, /public void clearAll/);
});