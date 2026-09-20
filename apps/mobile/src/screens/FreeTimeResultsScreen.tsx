import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AppScreen, ChecklistRow, EmptyState, ScreenHeader } from "../components/ui";
import { listTasks, type MobileTask } from "../api/tasks";
import { rtlText, space, type } from "../theme";

export function FreeTimeResultsScreen({
  minutes,
  onBack,
}: {
  minutes: number;
  onBack: () => void;
}) {
  const [tasks, setTasks] = useState<MobileTask[]>([]);

  useEffect(() => {
    void listTasks()
      .then((data) => setTasks(data.tasks.filter((task) => task.status === "open")))
      .catch(() => setTasks([]));
  }, []);

  return (
    <AppScreen>
      <ScreenHeader title="יש לי זמן פנוי" onBack={onBack} icon="time-outline" />
      <Text style={styles.sub}>משימות עד {minutes} דקות</Text>
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
  list: { gap: space.sm },
});
