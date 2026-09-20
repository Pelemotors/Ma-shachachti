import { useCallback, useEffect, useState } from "react";
import { Linking, StyleSheet, Text } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { apiRequest } from "../api/client";
import { nativeOAuthHint } from "../auth/nativeIdentity";
import { formatPlanTime } from "../api/planning";
import { ErrorText, Hint, PrimaryButton, ScreenShell } from "../ui/chrome";

WebBrowser.maybeCompleteAuthSession();

type CalendarState = {
  configured: boolean;
  connected: boolean;
  events: Array<{ title: string; start_at: string; end_at: string }>;
};

function oauthStatusFromUrl(url: string | null) {
  if (!url || !url.includes("calendar/oauth-complete")) return null;
  try {
    const parsed = new URL(url.replace(/^mashachachti:/, "https://app"));
    return parsed.searchParams.get("status");
  } catch {
    return null;
  }
}

export function CalendarScreen({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<CalendarState | null>(null);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"idle" | "connecting" | "syncing" | "disconnecting">("idle");

  const refresh = useCallback(async () => {
    const next = await apiRequest<CalendarState>("/api/calendar");
    setState(next);
    return next;
  }, []);

  useEffect(() => {
    void refresh().catch((err) => setError(err instanceof Error ? err.message : "שגיאה"));
  }, [refresh]);

  useEffect(() => {
    function applyReturn(url: string | null) {
      const status = oauthStatusFromUrl(url);
      if (!status) return;
      if (status === "cancelled") {
        setError("חיבור היומן בוטל.");
        setPhase("idle");
        return;
      }
      if (status === "error") {
        setError("חיבור היומן נכשל. נסי שוב.");
        setPhase("idle");
        return;
      }
      void refresh()
        .catch((err) => setError(err instanceof Error ? err.message : "שגיאה"))
        .finally(() => setPhase("idle"));
    }
    const sub = Linking.addEventListener("url", ({ url }) => applyReturn(url));
    void Linking.getInitialURL().then(applyReturn);
    return () => sub.remove();
  }, [refresh]);

  async function connect() {
    if (phase !== "idle") return;
    setError("");
    setPhase("connecting");
    try {
      const started = await apiRequest<{ authorizationUrl: string }>("/api/calendar/oauth/start");
      const result = await WebBrowser.openAuthSessionAsync(
        started.authorizationUrl,
        "mashachachti://calendar/oauth-complete",
      );
      if (result.type === "cancel" || result.type === "dismiss") {
        setError("חיבור היומן בוטל.");
        setPhase("idle");
        return;
      }
      if (result.type === "success") {
        const status = oauthStatusFromUrl(result.url);
        if (status === "cancelled") setError("חיבור היומן בוטל.");
        else if (status === "error") setError("חיבור היומן נכשל. נסי שוב.");
        else await refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "פתיחת חיבור היומן נכשלה.");
    } finally {
      setPhase("idle");
    }
  }

  async function syncNow() {
    if (phase !== "idle") return;
    setError("");
    setPhase("syncing");
    try {
      await apiRequest("/api/calendar", {
        method: "POST",
        body: JSON.stringify({ action: "sync" }),
      });
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "הסנכרון נכשל";
      setError(message);
    } finally {
      setPhase("idle");
    }
  }

  async function disconnect() {
    if (phase !== "idle") return;
    setError("");
    setPhase("disconnecting");
    try {
      await apiRequest("/api/calendar", {
        method: "POST",
        body: JSON.stringify({ action: "disconnect" }),
      });
      setState((prev) => (prev ? { ...prev, connected: false, events: [] } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "ניתוק נכשל");
    } finally {
      setPhase("idle");
    }
  }

  const live = Boolean(state?.configured);
  const busy = phase !== "idle";

  return (
    <ScreenShell title="יומן" onBack={onBack}>
      {!live ? <Hint>{nativeOAuthHint("calendar")}</Hint> : null}
      {live && !state?.connected ? (
        <PrimaryButton
          label={phase === "connecting" ? "מתחברים…" : "חבר Google Calendar"}
          onPress={() => void connect()}
          disabled={busy}
        />
      ) : null}
      {state?.connected ? (
        <>
          <PrimaryButton
            label={phase === "syncing" ? "מסנכרנים…" : "סנכרן עכשיו"}
            onPress={() => void syncNow()}
            disabled={busy}
          />
          <PrimaryButton
            label={phase === "disconnecting" ? "מנתקים…" : "ניתוק יומן"}
            onPress={() => void disconnect()}
            disabled={busy}
            danger
          />
        </>
      ) : null}
      {(state?.events ?? []).map((event) => (
        <Text key={`${event.start_at}-${event.title}`} style={styles.line}>
          {formatPlanTime(event.start_at)}–{formatPlanTime(event.end_at)} {event.title}
        </Text>
      ))}
      <ErrorText message={error} />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  line: { textAlign: "right", color: "#3D2B1F" },
});
