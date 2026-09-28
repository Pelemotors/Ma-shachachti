import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Visual height of tab icons+labels before safe-area padding. */
export const TAB_BAR_BODY_HEIGHT = 56;

/** Extra space so the last scroll row is not flush against chrome. */
export const SCROLL_END_GAP = 24;

/** Fallback when the IME reports show without a usable height (common on some emulators). */
const FALLBACK_KEYBOARD_HEIGHT = 320;

export function useKeyboardHeight() {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = Keyboard.addListener(showEvent, (event) => {
      const reported = event.endCoordinates?.height ?? 0;
      const metrics = Keyboard.metrics()?.height ?? 0;
      setHeight(Math.max(reported, metrics, FALLBACK_KEYBOARD_HEIGHT));
    });
    const onHide = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  return height;
}

export function useKeyboardOpen() {
  return useKeyboardHeight() > 0;
}

/** Padding for scroll content that sits above an in-tree bottom tab bar. */
export function useTabBarScrollPadding(extra = SCROLL_END_GAP) {
  const insets = useSafeAreaInsets();
  return TAB_BAR_BODY_HEIGHT + Math.max(insets.bottom, 8) + extra;
}
