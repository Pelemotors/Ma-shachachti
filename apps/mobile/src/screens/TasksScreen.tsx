import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  AppScreen,
  ChecklistRow,
  EmptyState,
  ScreenHeader,
  SecondaryPillButton,
} from "../components/ui";
import { completeTask, listTasks, type MobileTask } from "../api/tasks";
import { space } from "../theme";

type Filter = "dated" | "undated";

export function TasksScreen({ onBack }: { onBack?: () => void }) {
  const [tasks, setTasks] = useState<MobileTask[]>([]);
  const [filter, setFilter] = useState<Filter>("dated");

  const reload = useCallback(async () => {
    const data = await listTasks();
    setTasks(data.tasks.filter((task) => task.status !== "cancelled"));
  }, []);

  useEffect(() => {
    void reload().catch(() => setTasks([]));
  }, [reload]);

  const visible = tasks.filter((task) => {
    const dated = Boolean(task.due_on || task.due_at);
    return filter === "dated" ? dated : !dated;
  });

  return (
    <AppScreen>
      <ScreenHeader title="משימות" onBack={onBack} />
      <View style={styles.chips}>
        <SecondaryPillButton
          label="עם תאריך"
          selected={filter === "dated"}
          onPress={() => setFilter("dated")}
        />
        <SecondaryPillButton
          label="ללא תאריך"
          selected={filter === "undated"}
          onPress={() => setFilter("undated")}
        />
      </View>
      {visible.length === 0 ? (
        <EmptyState title="אין משימות בקבוצה הזו" />
      ) : (
        <View style={styles.list}>
          {visible.map((task) => (
            <ChecklistRow
              key={task.id}
              label={task.title}
              checked={task.status === "done"}
              onToggle={() => {
                if (task.status === "open") void completeTask(task.id).then(() => reload());
              }}
            />
          ))}
        </View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row-reverse", gap: 10, marginBottom: space.lg },
  list: { gap: space.sm },
});
