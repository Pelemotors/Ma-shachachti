import { Ionicons } from "@expo/vector-icons";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { heebo } from "../home-v4/homeV4Theme";
import { S } from "./settingsTheme";

export function HelpSettingsScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const rows = [
    {
      title: "יצירת קשר",
      subtitle: "שליחת מייל לתמיכה",
      onPress: () => void Linking.openURL("mailto:support@mashachachti.co.il"),
    },
    {
      title: "דיווח על בעיה",
      subtitle: "תיאור קצר של מה שלא עובד",
      onPress: () =>
        void Linking.openURL(
          "mailto:support@mashachachti.co.il?subject=%D7%93%D7%99%D7%95%D7%95%D7%97%20%D7%A2%D7%9C%20%D7%91%D7%A2%D7%99%D7%94",
        ),
    },
  ];
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backHit} accessibilityLabel="חזרה">
          <Ionicons name="chevron-forward" size={22} color={S.darkBrown} />
        </Pressable>
        <Text style={styles.title}>עזרה ותמיכה</Text>
        <View style={styles.backHit} />
      </View>
      <View style={styles.card}>
        {rows.map((row, i) => (
          <Pressable
            key={row.title}
            style={[styles.row, i < rows.length - 1 && styles.border]}
            onPress={row.onPress}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{row.title}</Text>
              <Text style={styles.rowSub}>{row.subtitle}</Text>
            </View>
            <Ionicons name="chevron-back" size={18} color={S.muted} />
          </Pressable>
        ))}
      </View>
      <Text style={styles.note}>שאלות נפוצות ומדריך מלא יתווספו בגרסאות הבאות.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: S.page, paddingHorizontal: S.padX },
  header: {
    height: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backHit: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: heebo("700"), fontSize: 26, color: S.text },
  card: {
    borderRadius: S.radiusCard,
    backgroundColor: S.surface,
    overflow: "hidden",
  },
  row: {
    minHeight: 68,
    paddingHorizontal: 16,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  border: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: S.divider },
  rowTitle: { fontFamily: heebo("600"), fontSize: 16, color: S.text, textAlign: "right" },
  rowSub: { fontFamily: heebo("400"), fontSize: 13, color: S.muted, textAlign: "right" },
  note: {
    marginTop: 16,
    fontFamily: heebo("400"),
    fontSize: 13,
    color: S.muted,
    textAlign: "center",
  },
});
