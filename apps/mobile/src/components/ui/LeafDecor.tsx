import { Dimensions, Image, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HOME_BOX, HOME_REF } from "../../product/homeGeometry";

const BRANCH = require("../../../assets/ui/branch-from-master.png");

export function LeafDecor() {
  const { width, height } = Dimensions.get("window");
  const insets = useSafeAreaInsets();
  const availH = height - insets.top - insets.bottom - 58;
  const s = Math.min(width / HOME_REF.w, availH / HOME_REF.h);
  const ox = (width - HOME_REF.w * s) / 2;
  const b = HOME_BOX.botanical;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image
        source={BRANCH}
        resizeMode="contain"
        style={{
          position: "absolute",
          left: ox + b.x * s,
          top: b.y * s,
          width: b.w * s,
          height: b.h * s,
          opacity: 0.4,
        }}
      />
    </View>
  );
}
