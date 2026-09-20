import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { apiRequest } from "../api/client";
import { nativeOAuthHint } from "../auth/nativeIdentity";
import { formatPlanTime } from "../api/planning";
import { ErrorText, Hint, PrimaryButton, ScreenShell } from "../ui/chrome";

type CalendarState = {
  configured: boolean;
  connected: boolean;
  events: Array<{ title: string; start_at: string; end_at: string }>;
};

export function CalendarScreen({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<CalendarState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void apiRequest<CalendarState>("/api/calendar")
      .then(setState)
      .catch((err) => setError(err instanceof Error ? err.message : "שגיאה"));
  }, []);

  async function disconnect() {
    setBusy(true);
    try {
      await apiRequest("/api/calendar", {
        method: "POST",
        body: JSON.stringify({ action: "disconnect" }),
      });
      setState((prev) => (prev ? { ...prev, connected: false, events: [] } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "ניתוק נכשל");
    } finally {
      setBusy(false);
    }
  }

  const live = Boolean(state?.configured);
  return (
    <ScreenShell title="יומן" onBack={onBack}>
      {!live ? <Hint>{nativeOAuthHint("calendar")}</Hint> : null}
      {live && !state?.connected ? (
        <Hint>אפשר לחבר יומן רק אחרי נטיעת מפתחות OAuth. החיבור אינו פעיל עכשיו.</Hint>
      ) : null}
      {(state?.events ?? []).map((event) => (
        <Text key={`${event.start_at}-${event.title}`} style={styles.line}>
          {formatPlanTime(event.start_at)}–{formatPlanTime(event.end_at)} {event.title}
        </Text>
      ))}
      {state?.connected ? (
        <PrimaryButton label="ניתוק יומן" onPress={() => void disconnect()} disabled={busy} danger />
      ) : null}
      <ErrorText message={error} />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  line: { textAlign: "right", color: "#3D2B1F" },
});
