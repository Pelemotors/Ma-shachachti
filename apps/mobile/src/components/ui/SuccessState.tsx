import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { colors, rtlText, space, type } from "../../theme";
import { PrimaryActionButton } from "./PrimaryActionButton";

export function SuccessState({
  title,
  onHome,
}: {
  title: string;
  onHome: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.circle}>
        <Ionicons name="checkmark" size={36} color={colors.accent} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <PrimaryActionButton label="חזרה הביתה" onPress={onHome} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "center", gap: space.xl, paddingBottom: 40 },
  circle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  title: { ...type.title, ...rtlText, textAlign: "center" },
});
