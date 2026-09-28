import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Reserves the Android/iOS system navigation / home-indicator inset.
 * Use when bottom chrome (tab bar) is hidden — e.g. keyboard open — so
 * footers and absolute composers are not drawn under the system bar.
 */
export function SystemBottomInset() {
  const insets = useSafeAreaInsets();
  if (insets.bottom <= 0) return null;
  return <View style={{ height: insets.bottom }} pointerEvents="none" />;
}

/** Padding for bottom sheets / modals / footers that own the bottom chrome. */
export function useBottomChromePadding(minDesignPad = 12) {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, 0) + minDesignPad;
}
