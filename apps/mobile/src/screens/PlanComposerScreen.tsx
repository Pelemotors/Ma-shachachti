import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  AppScreen,
  PrimaryActionButton,
  ScreenHeader,
  SecondaryPillButton,
} from "../components/ui";
import { replanDay, todayJerusalemDate } from "../api/planning";
import { listTasks } from "../api/tasks";
import { rtlText, space, type } from "../theme";

const DURATIONS = [15, 30, 45, 60, 90, 120];

export function PlanComposerScreen({
  mode,
  onBack,
  onDone,
}: {
  mode: "plan" | "freetime";
  onBack: () => void;
  onDone: (kind: "success" | "schedule" | "freetime") => void;
}) {
  const [minutes, setMinutes] = useState(mode === "freetime" ? 30 : 45);
  const [later, setLater] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const planMode = mode === "plan";

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const tasks = await listTasks();
      const openIds = tasks.tasks.filter((task) => task.status === "open").map((task) => task.id);
      await replanDay(todayJerusalemDate(), openIds);
      onDone(planMode ? "success" : "freetime");
    } catch (err) {
      setError(err instanceof Error ? err.message : "תכנון נכשל");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppScreen
      footer={
        <View style={styles.footer}>
          <PrimaryActionButton
            label={busy ? "מתכנן…" : planMode ? "צור לי לו״ז" : "הצג משימות"}
            onPress={() => void submit()}
            disabled={busy}
          />
        </View>
      }
    >
      <ScreenHeader
        title={planMode ? "צור לי לו״ז" : "יש לי זמן פנוי"}
        onBack={onBack}
        icon={planMode ? "calendar-outline" : "time-outline"}
      />
      <Text style={styles.sub}>
        {planMode ? "באיזה זמן יש לך?" : "כמה זמן פנוי?"}
      </Text>
      <View style={styles.pills}>
        {DURATIONS.map((value) => (
          <SecondaryPillButton
            key={value}
            label={String(value)}
            selected={minutes === value && !later}
            onPress={() => {
              setLater(false);
              setMinutes(value);
            }}
          />
        ))}
      </View>
      {planMode ? (
        <View style={styles.pills}>
          <SecondaryPillButton label="מאוחר יותר" selected={later} onPress={() => setLater(true)} />
        </View>
      ) : (
        <Text style={styles.hint}>מציגים משימות שמתאימות לחלון של עד {minutes} דקות.</Text>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  sub: { ...type.body, ...rtlText, marginBottom: space.lg },
  hint: { ...type.caption, ...rtlText, marginTop: space.md },
  pills: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10 },
  footer: { paddingHorizontal: 24, paddingBottom: 16 },
  error: { ...rtlText, color: "#8B2E1F", marginTop: space.md },
});
