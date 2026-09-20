import { Dimensions, Image, View } from "react-native";
import { HOME_REF } from "../../product/homeGeometry";

const REF = require("../../../assets/ui/home-master-underlay.png");

/** DEV-only reconstruction underlay. Hidden unless opacity is forced in code. */
export function ReferenceUnderlay({ opacity = 0 }: { opacity?: number }) {
  if (!__DEV__ || opacity <= 0) return null;
  const { width, height } = Dimensions.get("window");
  const s = Math.min(width / HOME_REF.w, height / HOME_REF.h);
  const w = HOME_REF.w * s;
  const h = HOME_REF.h * s;
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: (height - h) / 2,
        left: (width - w) / 2,
        width: w,
        height: h,
        opacity,
        zIndex: 40,
      }}
    >
      <Image source={REF} style={{ width: "100%", height: "100%" }} resizeMode="stretch" />
    </View>
  );
}
