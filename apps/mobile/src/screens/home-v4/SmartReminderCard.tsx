import { Pressable, StyleSheet, Text, View } from "react-native";
import { HomeV4Icon } from "./homeV4Icons";
import { heebo, V4 } from "./homeV4Theme";
import type { HomeReminderCandidate } from "./useHomeV4Data";

export function SmartReminderCard({
  scale,
  candidate,
  busy,
  onAdd,
}: {
  scale: number;
  candidate: HomeReminderCandidate | null;
  busy: boolean;
  onAdd: () => void;
}) {
  const s = scale;
  return (
    <View
      style={[
        styles.card,
        {
          marginHorizontal: 16 * s,
          minHeight: 96 * s,
          borderRadius: 24 * s,
          paddingHorizontal: 16 * s,
          paddingVertical: 14 * s,
        },
      ]}
    >
      <View style={styles.top}>
        <HomeV4Icon name="dots" size={16 * s} color={V4.muted} />
        <View style={{ flex: 1, marginHorizontal: 8 * s }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 * s }}>
            <Text style={{ fontFamily: heebo("700"), fontSize: 16 * s, color: V4.text, textAlign: "right" }}>
              שכדאי לזכור היום
            </Text>
            <HomeV4Icon name="sparkle" size={14 * s} color="#C9A36A" />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8 * s, marginTop: 6 * s }}>
            <Text
              style={{ fontFamily: heebo("600"), fontSize: 14 * s, color: V4.text, textAlign: "right", flex: 1 }}
              numberOfLines={1}
            >
              {candidate ? candidate.title : "אין משימה שצריכה תזכורת עכשיו"}
            </Text>
            <View style={[styles.chip, { width: 28 * s, height: 28 * s, borderRadius: 14 * s }]}>
              <HomeV4Icon name="package" size={14 * s} color="#B8895A" />
            </View>
          </View>
        </View>
      </View>
      <View style={[styles.bottom, { marginTop: 8 * s }]}>
        <Pressable
          onPress={onAdd}
          disabled={!candidate || busy}
          style={[
            styles.cta,
            {
              borderRadius: 18 * s,
              paddingHorizontal: 14 * s,
              height: 32 * s,
              opacity: !candidate || busy ? 0.45 : 1,
            },
          ]}
        >
          <Text style={{ fontFamily: heebo("600"), fontSize: 13 * s, color: V4.sageDeep }}>
            {busy ? "מוסיפה…" : "הוסיפי תזכורת"}
          </Text>
        </Pressable>
        <Text style={{ fontFamily: heebo("400"), fontSize: 11 * s, color: V4.muted, flex: 1, textAlign: "right" }}>
          כי פרטים קטנים עושים הבדל גדול
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: V4.card },
  top: { flexDirection: "row", alignItems: "flex-start" },
  chip: { backgroundColor: V4.tilePeach, alignItems: "center", justifyContent: "center" },
  bottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cta: {
    borderWidth: 1,
    borderColor: V4.sage,
    alignItems: "center",
    justifyContent: "center",
  },
});
