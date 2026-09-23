import { useEffect, useState } from "react";
import { BackHandler, StyleSheet, Text, View } from "react-native";
import {
  AppScreen,
  PrimaryActionButton,
  ScreenHeader,
  SecondaryPillButton,
} from "../components/ui";
import { getDayPlan, jerusalemDateFromNow, replanDay, selectOpenTaskIdsForDate, todayJerusalemDate } from "../api/planning";
import { listTasks } from "../api/tasks";
import { FREETIME_DEFAULT_MINUTES } from "../product/surfaceCommit";
import { rtlText, space, type } from "../theme";

const DURATIONS = [15, 30, 45, 60, 90, 120];
const DATE_CHIPS: Array<{ id: "today" | "tomorrow" | "later"; label: string; days: number }> = [
  { id: "today", label: "היום", days: 0 },
  { id: "tomorrow", label: "מחר", days: 1 },
  { id: "later", label: "אחר", days: 2 },
];

export function PlanComposerScreen({
  mode,
  onBack,
  onDone,
}: {
  mode: "plan" | "freetime";
  onBack: () => void;
  onDone: (payload: { kind: "success" | "schedule" | "freetime"; minutes: number; date: string }) => void;
}) {
  const [minutes, setMinutes] = useState(mode === "freetime" ? FREETIME_DEFAULT_MINUTES : 45);
  const [dateChip, setDateChip] = useState<(typeof DATE_CHIPS)[number]["id"]>("today");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const planMode = mode === "plan";
  const selectedDate = jerusalemDateFromNow(DATE_CHIPS.find((chip) => chip.id === dateChip)?.days ?? 0);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (!planMode) {
        onDone({ kind: "freetime", minutes, date: todayJerusalemDate() });
        return;
      }
      const date = selectedDate;
      const [tasks, current] = await Promise.all([listTasks(), getDayPlan(date)]);
      const alreadyOnPlan = current.items.map((item) => item.task_id);
      await replanDay(date, selectOpenTaskIdsForDate(tasks.tasks, date, alreadyOnPlan));
      onDone({ kind: "success", minutes, date });
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
      {planMode ? (
        <>
          <Text style={styles.sub}>לאיזה יום לתכנן?</Text>
          <View style={styles.pills}>
            {DATE_CHIPS.map((chip) => (
              <SecondaryPillButton
                key={chip.id}
                label={chip.label}
                selected={dateChip === chip.id}
                onPress={() => setDateChip(chip.id)}
              />
            ))}
          </View>
        </>
      ) : null}
      <Text style={styles.sub}>
        {planMode ? "באיזה זמן יש לך?" : "כמה זמן פנוי?"}
      </Text>
      <View style={styles.pills}>
        {DURATIONS.map((value) => (
          <SecondaryPillButton
            key={value}
            label={String(value)}
            selected={minutes === value}
            onPress={() => setMinutes(value)}
          />
        ))}
      </View>
      {planMode ? null : (
        <Text style={styles.hint}>מציגים משימות שמתאימות לחלון של עד {minutes} דקות.</Text>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  sub: { ...type.body, ...rtlText, marginBottom: space.lg },
  hint: { ...type.caption, ...rtlText, marginTop: space.md },
  pills: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10, marginBottom: space.lg },
  footer: { paddingHorizontal: 24, paddingBottom: 16 },
  error: { ...rtlText, color: "#8B2E1F", marginTop: space.md },
});
