import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { apiRequest } from "../api/client";
import { ErrorText, Hint, PrimaryButton, ScreenShell } from "../ui/chrome";

type Prefs = {
  default_reminder_minutes: number;
  kinds: Record<string, boolean>;
  developer_comms_enabled?: boolean;
};

export function NotificationSettingsScreen({ onBack }: { onBack: () => void }) {
  const [prefs, setPrefs] = useState<Prefs>({
    default_reminder_minutes: 30,
    kinds: {},
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void apiRequest<Prefs>("/api/preferences")
      .then(setPrefs)
      .catch((err) => setError(err instanceof Error ? err.message : "שגיאה"));
  }, []);

  async function save() {
    setBusy(true);
    setError("");
    try {
      setPrefs(
        await apiRequest<Prefs>("/api/preferences", {
          method: "PUT",
          body: JSON.stringify(prefs),
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  const remindersOn = prefs.kinds.REMINDER !== false;
  return (
    <ScreenShell title="התראות" onBack={onBack}>
      <Hint>אין רישום התקן לפני opt-in. התראות מסך נעילה נשארות כלליות.</Hint>
      <Pressable
        style={styles.row}
        onPress={() =>
          setPrefs((prev) => ({
            ...prev,
            kinds: { ...prev.kinds, REMINDER: !remindersOn },
          }))
        }
      >
        <Text style={styles.rowText}>תזכורות: {remindersOn ? "פועל" : "כבוי"}</Text>
      </Pressable>
      <Pressable
        style={styles.row}
        onPress={() =>
          setPrefs((prev) => ({
            ...prev,
            developer_comms_enabled: !prev.developer_comms_enabled,
          }))
        }
      >
        <Text style={styles.rowText}>
          הודעות מפתח: {prefs.developer_comms_enabled ? "פועל" : "כבוי כברירת מחדל"}
        </Text>
      </Pressable>
      <PrimaryButton label={busy ? "שומר…" : "שמירה"} onPress={() => void save()} disabled={busy} />
      <ErrorText message={error} />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: "#fff",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  rowText: { textAlign: "right", fontWeight: "600", color: "#3D2B1F" },
});
