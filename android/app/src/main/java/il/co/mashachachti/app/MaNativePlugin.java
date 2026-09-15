package il.co.mashachachti.app;

import android.Manifest;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.MediaRecorder;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Base64;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.util.TimeZone;
import java.util.UUID;

@CapacitorPlugin(
  name = "MaNative",
  permissions = {
    @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone"),
    @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
  }
)
public class MaNativePlugin extends Plugin {
  private static final String PREFS = "ma_native_secure";
  private static final String INSTALL_KEY = "installation_id";
  private static final String SHARE_KEY = "pending_share";
  private static final String PUSH_KEY = "push_token";
  private MediaRecorder recorder;
  private File recordingFile;

  private SharedPreferences securePrefs() {
    return getContext().getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE);
  }

  private void resolveValue(PluginCall call, Object value) {
    JSObject out = new JSObject();
    out.put("value", value);
    call.resolve(out);
  }

  @PluginMethod
  public void getPlatform(PluginCall call) {
    resolveValue(call, "android");
  }

  @PluginMethod
  public void getAppVersion(PluginCall call) {
    try {
      String version = getContext().getPackageManager()
        .getPackageInfo(getContext().getPackageName(), 0).versionName;
      resolveValue(call, version);
    } catch (Exception e) {
      call.reject(e.getMessage());
    }
  }

  @PluginMethod
  public void getBuildNumber(PluginCall call) {
    try {
      long code = getContext().getPackageManager()
        .getPackageInfo(getContext().getPackageName(), 0).getLongVersionCode();
      resolveValue(call, String.valueOf(code));
    } catch (Exception e) {
      call.reject(e.getMessage());
    }
  }

  @PluginMethod
  public void getInstallationId(PluginCall call) {
    SharedPreferences prefs = securePrefs();
    String id = prefs.getString(INSTALL_KEY, null);
    if (id == null) {
      id = UUID.randomUUID().toString();
      prefs.edit().putString(INSTALL_KEY, id).apply();
    }
    resolveValue(call, id);
  }

  @PluginMethod
  public void authenticateWithApple(PluginCall call) {
    JSObject out = new JSObject();
    out.put("status", "unavailable");
    out.put("reason", "Sign in with Apple זמין באפליקציית iOS.");
    call.resolve(out);
  }

  @PluginMethod
  public void authenticateWithGoogle(PluginCall call) {
    String clientId = getConfig().getString("googleClientId", null);
    if (clientId == null || clientId.isEmpty()) {
      JSObject out = new JSObject();
      out.put("status", "unavailable");
      out.put("reason", "חסר Google OAuth client id (OWNER_BLOCKED).");
      call.resolve(out);
      return;
    }
    // Client id present: hand off to Google Sign-In activity when configured.
    JSObject out = new JSObject();
    out.put("status", "unavailable");
    out.put("reason", "Google Sign-In ממתין ל-google-services.json ולאימות owner.");
    call.resolve(out);
  }

  @PluginMethod
  public void requestNotificationPermission(PluginCall call) {
    if (Build.VERSION.SDK_INT < 33) {
      resolveValue(call, "GRANTED");
      return;
    }
    requestPermissionForAlias("notifications", call, "notificationPermCb");
  }

  @PermissionCallback
  private void notificationPermCb(PluginCall call) {
    resolveValue(call, permissionLabel(Manifest.permission.POST_NOTIFICATIONS));
  }

  @PluginMethod
  public void getNotificationPermissionState(PluginCall call) {
    resolveValue(call, permissionLabel(Manifest.permission.POST_NOTIFICATIONS));
  }

  @PluginMethod
  public void getPushToken(PluginCall call) {
    resolveValue(call, securePrefs().getString(PUSH_KEY, null));
  }

  public void storePushToken(String token) {
    securePrefs().edit().putString(PUSH_KEY, token).apply();
  }

  @PluginMethod
  public void requestMicrophonePermission(PluginCall call) {
    requestPermissionForAlias("microphone", call, "micPermCb");
  }

  @PermissionCallback
  private void micPermCb(PluginCall call) {
    resolveValue(call, permissionLabel(Manifest.permission.RECORD_AUDIO));
  }

  @PluginMethod
  public void getMicrophonePermissionState(PluginCall call) {
    resolveValue(call, permissionLabel(Manifest.permission.RECORD_AUDIO));
  }

  @PluginMethod
  public void startAudioCapture(PluginCall call) {
    if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
      != PackageManager.PERMISSION_GRANTED) {
      JSObject out = new JSObject();
      out.put("status", "denied");
      call.resolve(out);
      return;
    }
    try {
      recordingFile = new File(getContext().getCacheDir(), "ma-capture-" + System.currentTimeMillis() + ".m4a");
      recorder = new MediaRecorder();
      recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
      recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
      recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
      recorder.setOutputFile(recordingFile.getAbsolutePath());
      recorder.prepare();
      recorder.start();
      JSObject out = new JSObject();
      out.put("status", "ok");
      call.resolve(out);
    } catch (Exception e) {
      JSObject out = new JSObject();
      out.put("status", "error");
      out.put("message", e.getMessage());
      call.resolve(out);
    }
  }

  @PluginMethod
  public void stopAudioCapture(PluginCall call) {
    try {
      if (recorder != null) {
        recorder.stop();
        recorder.release();
        recorder = null;
      }
      JSObject out = new JSObject();
      if (recordingFile == null || !recordingFile.exists()) {
        out.put("status", "error");
        out.put("message", "empty");
        call.resolve(out);
        return;
      }
      byte[] bytes = readFile(recordingFile);
      out.put("status", "ok");
      out.put("mimeType", "audio/mp4");
      out.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
      out.put("durationMs", 0);
      call.resolve(out);
    } catch (Exception e) {
      JSObject out = new JSObject();
      out.put("status", "interrupted");
      out.put("message", e.getMessage());
      call.resolve(out);
    }
  }

  @PluginMethod
  public void getInitialDeepLink(PluginCall call) {
    Intent intent = getActivity().getIntent();
    JSObject out = new JSObject();
    if (intent != null && intent.getData() != null) {
      out.put("href", intent.getData().toString());
      out.put("receivedAt", java.time.Instant.now().toString());
      call.resolve(out);
      return;
    }
    out.put("value", JSObject.NULL);
    call.resolve(out);
  }

  @PluginMethod
  public void getPendingSharedPayload(PluginCall call) {
    String raw = securePrefs().getString(SHARE_KEY, null);
    if (raw == null) {
      resolveValue(call, null);
      return;
    }
    try {
      call.resolve(new JSObject(raw));
    } catch (Exception e) {
      resolveValue(call, null);
    }
  }

  @PluginMethod
  public void clearSharedPayload(PluginCall call) {
    securePrefs().edit().remove(SHARE_KEY).apply();
    call.resolve();
  }

  public void stageSharedPayload(JSONObject json) {
    securePrefs().edit().putString(SHARE_KEY, json.toString()).apply();
  }

  @PluginMethod
  public void pickImage(PluginCall call) {
    JSObject out = new JSObject();
    out.put("status", "unavailable");
    call.resolve(out);
  }

  @PluginMethod
  public void captureImage(PluginCall call) {
    JSObject out = new JSObject();
    out.put("status", "unavailable");
    call.resolve(out);
  }

  @PluginMethod
  public void openAppSettings(PluginCall call) {
    Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
    intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
    getActivity().startActivity(intent);
    call.resolve();
  }

  @PluginMethod
  public void getTimezone(PluginCall call) {
    resolveValue(call, TimeZone.getDefault().getID());
  }

  @PluginMethod
  public void secureGet(PluginCall call) {
    resolveValue(call, securePrefs().getString(call.getString("key"), null));
  }

  @PluginMethod
  public void secureSet(PluginCall call) {
    securePrefs().edit().putString(call.getString("key"), call.getString("value")).apply();
    call.resolve();
  }

  @PluginMethod
  public void secureRemove(PluginCall call) {
    securePrefs().edit().remove(call.getString("key")).apply();
    call.resolve();
  }

  @PluginMethod
  public void stageBlob(PluginCall call) {
    securePrefs().edit().putString("stage:" + call.getString("key"), call.getString("value")).apply();
    call.resolve();
  }

  @PluginMethod
  public void readStaged(PluginCall call) {
    resolveValue(call, securePrefs().getString("stage:" + call.getString("key"), null));
  }

  @PluginMethod
  public void clearStaged(PluginCall call) {
    securePrefs().edit().remove("stage:" + call.getString("key")).apply();
    call.resolve();
  }

  private String permissionLabel(String permission) {
    if (Build.VERSION.SDK_INT < 33 && Manifest.permission.POST_NOTIFICATIONS.equals(permission)) {
      return "GRANTED";
    }
    int state = ContextCompat.checkSelfPermission(getContext(), permission);
    if (state == PackageManager.PERMISSION_GRANTED) return "GRANTED";
    if (ActivityCompat.shouldShowRequestPermissionRationale(getActivity(), permission)) return "DENIED";
    return "UNKNOWN";
  }

  private byte[] readFile(File file) throws Exception {
    FileInputStream in = new FileInputStream(file);
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    byte[] buf = new byte[4096];
    int n;
    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
    in.close();
    return out.toByteArray();
  }
}
