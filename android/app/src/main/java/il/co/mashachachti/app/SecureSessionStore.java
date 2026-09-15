package il.co.mashachachti.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import java.util.Map;

/**
 * ANDROID_NATIVE secure store for auth/session material.
 * Values are encrypted with AES-256-GCM; the master key lives in Android Keystore.
 */
public final class SecureSessionStore {
  private static final String TAG = "SecureSessionStore";
  private static final String ENCRYPTED_PREFS = "ma_native_secure_encrypted";
  private static final String LEGACY_PLAIN_PREFS = "ma_native_secure";
  private static final String MASTER_KEY_ALIAS = "ma_shachachti_session_master_key";

  private static SecureSessionStore instance;

  private final SharedPreferences prefs;
  private final boolean keystoreBacked;

  private SecureSessionStore(SharedPreferences prefs, boolean keystoreBacked) {
    this.prefs = prefs;
    this.keystoreBacked = keystoreBacked;
  }

  public static synchronized SecureSessionStore getInstance(Context context) {
    if (instance != null) return instance;
    Context app = context.getApplicationContext();
    try {
      MasterKey masterKey = new MasterKey.Builder(app, MASTER_KEY_ALIAS)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build();
      SharedPreferences encrypted = EncryptedSharedPreferences.create(
        app,
        ENCRYPTED_PREFS,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
      );
      migrateLegacyPlaintext(app, encrypted);
      instance = new SecureSessionStore(encrypted, masterKey.isKeyStoreBacked());
      return instance;
    } catch (Exception fatal) {
      Log.e(TAG, "Keystore secure store unavailable; refusing plaintext fallback", fatal);
      // Wipe any legacy plaintext so secrets are not left readable after failure.
      wipeLegacyPlaintext(app);
      throw new IllegalStateException("Secure session store unavailable", fatal);
    }
  }

  /** Test/reset helper — not used by production UI. */
  static synchronized void resetForTests() {
    instance = null;
  }

  public boolean isKeystoreBacked() {
    return keystoreBacked;
  }

  public String get(String key) {
    if (key == null || key.isEmpty()) return null;
    try {
      return prefs.getString(key, null);
    } catch (Exception corrupted) {
      Log.w(TAG, "Corrupted secure entry; clearing store", corrupted);
      clearAll();
      return null;
    }
  }

  public void put(String key, String value) {
    if (key == null || key.isEmpty()) return;
    try {
      SharedPreferences.Editor editor = prefs.edit();
      if (value == null) editor.remove(key);
      else editor.putString(key, value);
      // commit() for atomic overwrite of refresh tokens
      editor.commit();
    } catch (Exception corrupted) {
      Log.w(TAG, "Secure write failed; clearing store", corrupted);
      clearAll();
      throw new IllegalStateException("Secure write failed", corrupted);
    }
  }

  public void remove(String key) {
    if (key == null || key.isEmpty()) return;
    try {
      prefs.edit().remove(key).commit();
    } catch (Exception corrupted) {
      Log.w(TAG, "Secure remove failed; clearing store", corrupted);
      clearAll();
    }
  }

  public void clearAll() {
    try {
      prefs.edit().clear().commit();
    } catch (Exception ignored) {
      /* best effort */
    }
  }

  private static void migrateLegacyPlaintext(Context app, SharedPreferences encrypted) {
    SharedPreferences legacy = app.getSharedPreferences(LEGACY_PLAIN_PREFS, Context.MODE_PRIVATE);
    Map<String, ?> all = legacy.getAll();
    if (all == null || all.isEmpty()) return;
    SharedPreferences.Editor editor = encrypted.edit();
    for (Map.Entry<String, ?> entry : all.entrySet()) {
      Object value = entry.getValue();
      if (value instanceof String) {
        editor.putString(entry.getKey(), (String) value);
      }
    }
    editor.commit();
    legacy.edit().clear().commit();
  }

  private static void wipeLegacyPlaintext(Context app) {
    try {
      app.getSharedPreferences(LEGACY_PLAIN_PREFS, Context.MODE_PRIVATE).edit().clear().commit();
    } catch (Exception ignored) {
      /* best effort */
    }
  }
}
