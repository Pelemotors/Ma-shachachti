import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, space } from "../../theme";
import { LeafDecor } from "./LeafDecor";

export function AppScreen({
  children,
  footer,
  scroll = true,
  padded = true,
}: {
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  padded?: boolean;
}) {
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.content, padded ? styles.padded : null]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, padded ? styles.padded : null]}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <LeafDecor />
      {body}
      {footer}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingBottom: 28 },
  padded: { paddingHorizontal: space.page },
});
