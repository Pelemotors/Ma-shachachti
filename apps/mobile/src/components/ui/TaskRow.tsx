import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, rtlText } from "../../theme";

export function TaskRow({
  title,
  time,
  icon,
  onPress,
  homeMaster = false,
  scale = 1,
}: {
  title: string;
  time?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  homeMaster?: boolean;
  scale?: number;
}) {
  const s = scale;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.row,
        homeMaster ? styles.homeRow : null,
        homeMaster
          ? {
              borderRadius: 22 * s,
              backgroundColor: "#FFFDFC",
              paddingHorizontal: 14 * s,
              gap: 10 * s,
            }
          : null,
      ]}
    >
      {homeMaster ? (
        <>
          <View style={[styles.check, { width: 18 * s, height: 18 * s, borderRadius: 9 * s, borderColor: "#E8D7CB" }]} />
          <Text style={[styles.title, { fontSize: 15 * s, lineHeight: 20 * s, color: "#342B28" }]} numberOfLines={1}>
            {title}
          </Text>
          {icon ? <Ionicons name={icon} size={Math.round(16 * s)} color="#8A7970" /> : null}
          {time ? <Text style={[styles.time, { fontSize: 13 * s, lineHeight: 18 * s, minWidth: 44 * s, textAlign: "right" }]}>{time}</Text> : null}
        </>
      ) : (
        <>
          <View style={styles.check} />
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {icon ? <Ionicons name={icon} size={16} color={colors.textMuted} /> : null}
          {time ? <Text style={styles.time}>{time}</Text> : null}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    height: "100%",
    minHeight: 42,
    borderRadius: 24,
    backgroundColor: "#FFFDFB",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 10,
  },
  homeRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
  },
  check: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  title: { flex: 1, ...rtlText, color: colors.text, fontSize: 14, fontWeight: "500" },
  time: { color: colors.textMuted, fontSize: 13, fontWeight: "600", minWidth: 44, textAlign: "left" },
});
