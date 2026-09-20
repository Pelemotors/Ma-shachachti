import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { colors, elevation, radius, space } from "../../theme";

export function RoundedCard({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: space.lg,
    ...elevation.card,
  },
});
