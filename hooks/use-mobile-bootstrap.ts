"use client";

import { useEffect } from "react";
import { authFetch, supabase } from "@/lib/supabase-browser";
import { nativeCapability } from "@/lib/native";
import { loginPathWithResume, resumePathAfterAuth } from "@/lib/native/deep-links";
import { interpretCapture } from "@/lib/capture/ingest";

export function useMobileBootstrap(options: {
  userId: string | null;
  onNavigate: (href: string) => void;
  onChatText?: (text: string) => void;
}) {
  useEffect(() => {
    let alive = true;
    async function boot() {
      const native = nativeCapability();
      const [platform, version, build, installationId, timezone] =
        await Promise.all([
          native.getPlatform(),
          native.getAppVersion(),
          native.getBuildNumber(),
          native.getInstallationId(),
          native.getTimezone(),
        ]);
      void authFetch("/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "APP_OPEN",
          metadata: { platform },
        }),
      }).catch(() => null);

      if (options.userId) {
        const pushPermission = await native.getNotificationPermissionState();
        const pushToken = await native.getPushToken();
        await authFetch("/api/devices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            installationId,
            platform,
            appVersion: version,
            buildNumber: build,
            pushToken,
            pushProvider:
              platform === "ios" ? "apns" : platform === "android" ? "fcm" : "web_push",
            pushPermission,
            timezone,
          }),
        }).catch(() => null);
        await authFetch(
          `/api/mobile/version?platform=${platform}&version=${encodeURIComponent(version)}&build=${encodeURIComponent(build)}`,
        ).catch(() => null);
      }

      const initial = await native.getInitialDeepLink();
      if (initial?.href && alive) {
        void authFetch("/api/telemetry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "DEEP_LINK_OPENED" }),
        }).catch(() => null);
        // userId prop may still be null while chat-app finishes getSession.
        // Prefer an explicit session check before sending anyone to /login.
        let signedIn = Boolean(options.userId);
        if (!signedIn && supabase) {
          const { data } = await supabase.auth.getSession();
          signedIn = Boolean(data.session?.user?.id);
        }
        if (!signedIn) {
          options.onNavigate(loginPathWithResume(initial.href));
        } else {
          options.onNavigate(resumePathAfterAuth(initial.href));
        }
      }

      const share = await native.getPendingSharedPayload();
      if (share && options.userId && alive) {
        const mutationId = crypto.randomUUID();
        const intent = interpretCapture({
          kind: "share",
          text: share.text,
          url: share.url,
          imageCount: share.imageCount,
          mutationId,
        });
        void intent;
        await authFetch("/api/captures", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "share",
            text: share.text,
            url: share.url,
            imageCount: share.imageCount,
            mutationId,
          }),
        }).catch(() => null);
        await native.clearSharedPayload();
      } else if (share && !options.userId) {
        let signedIn = false;
        if (supabase) {
          const { data } = await supabase.auth.getSession();
          signedIn = Boolean(data.session?.user?.id);
        }
        if (!signedIn) {
          options.onNavigate(loginPathWithResume("/app?view=home"));
        }
      }
    }
    void boot();
    return () => {
      alive = false;
    };
  }, [options.userId, options.onNavigate, options.onChatText]);
}
