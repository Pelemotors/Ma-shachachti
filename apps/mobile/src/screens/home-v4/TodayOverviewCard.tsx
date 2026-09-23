import { Pressable, StyleSheet, Text, View } from "react-native";
import { TodayTaskRow } from "./TodayTaskRow";
import { HomeV4Icon } from "./homeV4Icons";
import { heebo, V4 } from "./homeV4Theme";
import type { HomeNowRow } from "../../product/canonicalHome";

export function TodayOverviewCard({
  scale,
  done,
  total,
  rows,
  hasPlan,
  onShowAll,
  onCreatePlan,
  onComplete,
}: {
  scale: number;
  done: number;
  total: number;
  rows: HomeNowRow[];
  hasPlan: boolean;
  onShowAll: () => void;
  onCreatePlan: () => void;
  onComplete: (taskId: string | null) => void;
}) {
  const s = scale;
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  return (
    <View
      style={[
        styles.card,
        {
          marginHorizontal: 16 * s,
          minHeight: 176 * s,
          borderRadius: 24 * s,
          padding: 16 * s,
        },
      ]}
    >
      <View style={styles.top}>
        <Pressable onPress={onShowAll} style={styles.showAll} accessibilityLabel="הצג הכל">
          <HomeV4Icon name="chevron" size={14 * s} color={V4.muted} />
          <Text style={{ fontFamily: heebo("500"), fontSize: 13 * s, color: V4.muted }}>הצג הכל</Text>
        </Pressable>
        <View style={{ alignItems: "flex-end", flex: 1 }}>
          <Text style={{ fontFamily: heebo("700"), fontSize: 18 * s, lineHeight: 24 * s, color: V4.text }}>
            עכשיו אצלך
          </Text>
          <Text style={{ fontFamily: heebo("400"), fontSize: 11 * s, color: V4.muted, marginTop: 2 * s }}>
            {hasPlan ? `${done} מתוך ${total} משימות בוצעו` : "אין עדיין לו״ז להיום"}
          </Text>
          <View style={[styles.track, { width: 114 * s, height: 6 * s, borderRadius: 3 * s, marginTop: 8 * s }]}>
            <View style={{ width: `${ratio * 100}%`, height: "100%", backgroundColor: V4.sageSoft, borderRadius: 3 * s }} />
          </View>
        </View>
      </View>
      <View style={{ marginTop: 12 * s, gap: 8 * s }}>
        {!hasPlan ? (
          <Pressable onPress={onCreatePlan} accessibilityLabel="צור לי לו״ז">
            <Text style={{ fontFamily: heebo("600"), fontSize: 14 * s, color: V4.sageDeep, textAlign: "right" }}>
              צור לי לו״ז
            </Text>
          </Pressable>
        ) : rows.length === 0 ? (
          <Text style={{ fontFamily: heebo("400"), fontSize: 13 * s, color: V4.muted, textAlign: "right" }}>
            אין משימות פתוחות בלו״ז להמשך היום.
          </Text>
        ) : (
          rows.map((row) => (
            <TodayTaskRow
              key={row.id}
              scale={s}
              time={row.time}
              title={row.title}
              icon={row.icon}
              onToggle={() => onComplete(row.taskId)}
            />
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: V4.card,
    shadowColor: V4.shadow,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  top: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  showAll: { flexDirection: "row", alignItems: "center", gap: 2, paddingTop: 4 },
  track: { backgroundColor: V4.track, overflow: "hidden", alignSelf: "flex-end" },
});
