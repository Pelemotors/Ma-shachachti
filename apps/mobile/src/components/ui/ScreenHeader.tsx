import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, rtlText, space, type } from "../../theme";

export function ScreenHeader({
  title,
  onBack,
  icon,
}: {
  title: string;
  onBack?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.row}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12} style={styles.hit} accessibilityLabel="חזרה">
          <Ionicons name="chevron-forward" size={22} color={colors.text} />
        </Pressable>
      ) : (
        <View style={styles.hit} />
      )}
      <Text style={styles.title}>{title}</Text>
      <View style={styles.hit}>
        {icon ? <Ionicons name={icon} size={20} color={colors.accent} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: space.md,
  },
  title: { ...type.title, ...rtlText, flex: 1, textAlign: "center" },
  hit: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
});
