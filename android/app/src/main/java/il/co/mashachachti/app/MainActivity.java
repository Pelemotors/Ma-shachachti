package il.co.mashachachti.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.UUID;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(MaNativePlugin.class);
    super.onCreate(savedInstanceState);
    handleIncoming(getIntent());
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    handleIncoming(intent);
  }

  private void handleIncoming(Intent intent) {
    if (intent == null || getBridge() == null) return;
    try {
      if (Intent.ACTION_SEND.equals(intent.getAction()) || Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
        JSONObject payload = new JSONObject();
        payload.put("id", UUID.randomUUID().toString());
        payload.put("text", intent.getStringExtra(Intent.EXTRA_TEXT));
        Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (uri != null) payload.put("url", uri.toString());
        int imageCount = 0;
        if (Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
          ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
          imageCount = list != null ? list.size() : 0;
        } else if (uri != null) {
          imageCount = 1;
        }
        payload.put("imageCount", imageCount);
        payload.put("stagedAt", java.time.Instant.now().toString());
        var handle = getBridge().getPlugin("MaNative");
        if (handle != null && handle.getInstance() instanceof MaNativePlugin plugin) {
          plugin.stageSharedPayload(payload);
        }
      }
    } catch (Exception ignored) {
      // Share staging must never crash the app.
    }
  }
}
