import { useEffect, useState } from "react";
import { BackHandler, Pressable, StyleSheet, Text, View } from "react-native";
import { AppScreen, ChecklistRow, EmptyState, ScreenHeader } from "../components/ui";
import { listTasks, type MobileTask } from "../api/tasks";
import { resolveFreetimeMinutes, taskFitsFreeTimeWindow } from "../product/surfaceCommit";
import { rtlText, space, type } from "../theme";

export function FreeTimeResultsScreen({
  minutes,
  onBack,
  onAdjust,
}: {
  minutes: number;
  onBack: () => void;
  onAdjust?: () => void;
}) {
  const selectedMinutes = resolveFreetimeMinutes(minutes);
  const [tasks, setTasks] = useState<MobileTask[]>([]);

  useEffect(() => {
    void listTasks()
      .then((data) =>
        setTasks(
          data.tasks.filter((task) => taskFitsFreeTimeWindow(task, selectedMinutes)),
        ),
      )
      .catch(() => setTasks([]));
  }, [selectedMinutes]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  return (
    <AppScreen
      footer={
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="סיום וחזרה"
            onPress={onBack}
            style={styles.done}
          >
            <Text style={[type.body, rtlText, styles.doneText]}>סיום וחזרה</Text>
          </Pressable>
          {onAdjust ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="שני משך"
              onPress={onAdjust}
              style={styles.adjust}
            >
              <Text style={[type.body, rtlText]}>שני משך</Text>
            </Pressable>
          ) : null}
        </View>
      }
    >
      <ScreenHeader title="יש לי זמן פנוי" onBack={onBack} icon="time-outline" />
      <Text
        style={styles.sub}
        accessibilityLabel={`משך נבחר ${selectedMinutes} דקות`}
      >
        משימות עד {selectedMinutes} דקות
      </Text>
      {tasks.length === 0 ? (
        <EmptyState title="אין משימות פתוחות שמתאימות עכשיו" />
      ) : (
        <View style={styles.list}>
          {tasks.map((task) => (
            <ChecklistRow key={task.id} label={task.title} />
          ))}
        </View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  sub: { ...type.body, ...rtlText, marginBottom: space.lg },
  list: { gap: space.sm, marginBottom: space.lg },
  footer: { paddingHorizontal: 24, paddingBottom: 16 },
  done: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#2F3E34",
  },
  doneText: { color: "#FFFFFF" },
  adjust: {
    marginTop: space.sm,
    paddingVertical: 12,
    alignItems: "center",
  },
});
