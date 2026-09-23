import type { ReactNode } from "react";
import { useRef } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, space } from "../../theme";
import { LeafDecor } from "./LeafDecor";

export function AppScreen({
  children,
  footer,
  scroll = true,
  padded = true,
  stickToBottom = false,
}: {
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  stickToBottom?: boolean;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const body = scroll ? (
    <ScrollView
      ref={scrollRef}
      style={styles.flex}
      contentContainerStyle={[styles.content, padded ? styles.padded : null]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      onContentSizeChange={() => {
        if (stickToBottom) scrollRef.current?.scrollToEnd({ animated: false });
      }}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, padded ? styles.padded : null]}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <LeafDecor />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {body}
        {footer ? <View style={styles.footerSlot}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingBottom: 28 },
  padded: { paddingHorizontal: space.page },
  footerSlot: { flexGrow: 0, flexShrink: 0 },
});
