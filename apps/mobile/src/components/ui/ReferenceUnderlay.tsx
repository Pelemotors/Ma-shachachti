import { Dimensions, Image } from "react-native";
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
    <Image
      source={REF}
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
      resizeMode="stretch"
    />
  );
}
