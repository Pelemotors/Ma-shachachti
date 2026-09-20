import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { getDayPlan, todayJerusalemDate, formatPlanTime, type MobileDayPlan } from "../api/planning";

export function ProductHomeScreen({
  onOpen,
}: {
  onOpen: (screen: string) => void;
}) {
  const [plan, setPlan] = useState<MobileDayPlan | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void getDayPlan(todayJerusalemDate())
      .then(setPlan)
      .catch((err) => setError(err instanceof Error ? err.message : "שגיאה"));
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.title}>מה שכחתי?</Text>
      <Text style={styles.sub}>הלו״ז של היום נטען מ-day_plan בלבד.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {(plan?.items ?? []).map((item) => (
        <Text key={`${item.task_id}-${item.start_at}`} style={styles.line}>
          {formatPlanTime(item.start_at)} · {item.kind === "fixed" ? "קבוע" : "גמיש"}
        </Text>
      ))}
      {(plan?.conflicts ?? []).map((conflict) => (
        <Text key={conflict.title} style={styles.conflict}>
          התנגשות: {conflict.title}
        </Text>
      ))}
      {[
        ["tasks", "משימות"],
        ["chat", "צ׳אט"],
        ["lists", "קניות וצ׳קליסטים"],
        ["plan", "צור לי לו״ז"],
        ["freetime", "יש לי זמן פנוי"],
        ["bank", "בנק / קול"],
        ["calendar", "יומן"],
        ["household", "מרחב משותף"],
        ["notifications", "התראות"],
        ["privacy", "פרטיות וחשבון"],
      ].map(([id, label]) => (
        <Pressable key={id} style={styles.btn} onPress={() => onOpen(id)}>
          <Text style={styles.btnText}>{label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, gap: 10, backgroundColor: "#F7F1EA" },
  title: { fontSize: 26, fontWeight: "700", textAlign: "right", color: "#3D2B1F" },
  sub: { textAlign: "right", color: "#8A7464" },
  line: { textAlign: "right", color: "#5C4033" },
  conflict: { textAlign: "right", color: "#8B2E1F" },
  error: { color: "#8B2E1F", textAlign: "right" },
  btn: {
    minHeight: 48,
    backgroundColor: "#fff",
    borderRadius: 12,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  btnText: { textAlign: "right", fontWeight: "600", color: "#3D2B1F" },
});
