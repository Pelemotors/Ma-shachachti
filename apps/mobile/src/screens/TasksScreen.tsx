import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { completeTask, createTask, listTasks, type MobileTask } from "../api/tasks";
import { ErrorText, Field, PrimaryButton, ScreenShell } from "../ui/chrome";

export function TasksScreen({ onBack }: { onBack: () => void }) {
  const [tasks, setTasks] = useState<MobileTask[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const data = await listTasks();
    setTasks(data.tasks.filter((task) => task.status !== "cancelled"));
  }, []);

  useEffect(() => {
    void reload().catch((err) => setError(err instanceof Error ? err.message : "שגיאה"));
  }, [reload]);

  async function add() {
    const next = title.trim();
    if (!next) return;
    setBusy(true);
    setError("");
    try {
      const data = await createTask(next);
      setTasks(data.tasks.filter((task) => task.status !== "cancelled"));
      setTitle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  async function done(id: string) {
    setBusy(true);
    setError("");
    try {
      const data = await completeTask(id);
      setTasks(data.tasks.filter((task) => task.status !== "cancelled"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "עדכון נכשל");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenShell title="משימות" onBack={onBack}>
      <Field value={title} onChangeText={setTitle} placeholder="משימה חדשה" />
      <PrimaryButton label={busy ? "שומר…" : "הוספה"} onPress={() => void add()} disabled={busy} />
      <ErrorText message={error} />
      {tasks.length === 0 ? <Text style={styles.empty}>אין משימות פתוחות</Text> : null}
      {tasks.map((task) => (
        <Pressable
          key={task.id}
          style={styles.row}
          onPress={() => {
            if (task.status === "open") void done(task.id);
          }}
        >
          <Text style={[styles.rowText, task.status === "done" ? styles.done : null]}>
            {task.status === "done" ? "בוצע · " : ""}
            {task.title}
          </Text>
        </Pressable>
      ))}
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
  rowText: { textAlign: "right", color: "#3D2B1F", fontWeight: "600" },
  done: { color: "#8A7464", textDecorationLine: "line-through" },
  empty: { textAlign: "right", color: "#8A7464" },
});
