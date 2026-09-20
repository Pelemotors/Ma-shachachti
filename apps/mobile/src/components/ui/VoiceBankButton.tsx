import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";

const BARS = [6, 11, 8, 14, 9, 12, 7];

export function VoiceBankButton({
  onPress,
  homeLock = false,
  scale = 1,
}: {
  onPress: () => void;
  homeLock?: boolean;
  scale?: number;
}) {
  const s = scale;
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.btn,
        homeLock
          ? {
              borderRadius: 24 * s,
              backgroundColor: "#FFFDFC",
              gap: 8 * s,
              paddingHorizontal: 16 * s,
            }
          : null,
      ]}
      accessibilityLabel="הקלט לבנק"
    >
      <View style={[styles.wave, homeLock ? { height: 16 * s, gap: 2 * s } : null]}>
        {BARS.map((h, i) => (
          <View
            key={i}
            style={[
              styles.bar,
              { height: h * s },
              homeLock ? { width: 2 * s, backgroundColor: "#A66B59" } : null,
            ]}
          />
        ))}
      </View>
      <Text style={[styles.label, homeLock ? { fontSize: 15 * s, lineHeight: 20 * s, color: "#8A7970" } : null]}>
        הקלט לבנק
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: "100%",
    width: "100%",
    minHeight: 34,
    paddingHorizontal: 22,
    borderRadius: 18,
    backgroundColor: colors.surface,
  },
  wave: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    height: 16,
  },
  bar: {
    width: 2,
    borderRadius: 1,
    backgroundColor: colors.accent,
  },
  label: {
    color: colors.textMuted,
    fontWeight: "500",
    fontSize: 14,
  },
});
