import type { ReactNode } from "react";
import { useRef } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { SCROLL_END_GAP, useKeyboardHeight } from "../../layout/keyboard";
import { colors, space } from "../../theme";
import { LeafDecor } from "./LeafDecor";

export function AppScreen({
  children,
  footer,
  scroll = true,
  padded = true,
  stickToBottom = false,
  decor = true,
  /**
   * When true, also inset the bottom safe area inside this screen.
   * Default false: bottom chrome (tab bar / screen footer) owns the bottom inset.
   */
  includeBottomSafeArea = false,
}: {
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  stickToBottom?: boolean;
  decor?: boolean;
  includeBottomSafeArea?: boolean;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const keyboardHeight = useKeyboardHeight();
  const edges: Edge[] = includeBottomSafeArea
    ? ["top", "left", "right", "bottom"]
    : ["top", "left", "right"];

  const body = scroll ? (
    <ScrollView
      ref={scrollRef}
      style={styles.flex}
      contentContainerStyle={[
        styles.content,
        padded ? styles.padded : null,
        footer ? styles.contentWithFooter : null,
      ]}
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

  // Android Manifest uses adjustResize. Avoid fighting it with behavior="height".
  // Still lift the footer by keyboard inset when resize does not move absolute/footer chrome.
  const androidLift = Platform.OS === "android" && keyboardHeight > 0 ? keyboardHeight : 0;

  const frame = (
    <>
      {body}
      {footer ? (
        <View style={[styles.footerSlot, androidLift ? { marginBottom: androidLift } : null]}>
          {footer}
        </View>
      ) : null}
    </>
  );

  return (
    <SafeAreaView style={styles.safe} edges={edges}>
      {decor ? <LeafDecor /> : null}
      {Platform.OS === "ios" ? (
        <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={0}>
          {frame}
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.flex}>{frame}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingBottom: SCROLL_END_GAP },
  contentWithFooter: { paddingBottom: SCROLL_END_GAP + 8 },
  padded: { paddingHorizontal: space.page },
  footerSlot: { flexGrow: 0, flexShrink: 0 },
});
