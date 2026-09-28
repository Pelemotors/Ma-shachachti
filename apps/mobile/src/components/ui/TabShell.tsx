import type { ReactNode } from "react";
import { View } from "react-native";
import { BottomNavBar, type ProductTab } from "./BottomNavBar";
import { useKeyboardOpen } from "../../layout/keyboard";

/**
 * Shared tab chrome for Tasks / Shopping (and any future tab that hosts BottomNavBar).
 * Hides the tab bar while the keyboard is open so inputs/footers are not covered.
 */
export function TabShell({
  active,
  onChange,
  children,
}: {
  active: ProductTab;
  onChange: (id: ProductTab) => void;
  children: ReactNode;
}) {
  const keyboardOpen = useKeyboardOpen();
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>{children}</View>
      {keyboardOpen ? null : <BottomNavBar active={active} onChange={onChange} />}
    </View>
  );
}
