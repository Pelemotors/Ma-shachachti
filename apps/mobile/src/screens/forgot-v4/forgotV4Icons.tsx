import { Image, type ImageStyle, type StyleProp } from "react-native";
import type { ForgottenIcon } from "../../api/forgot";

const ICONS: Record<ForgottenIcon | "plus" | "checkbox", number> = {
  document: require("../../../assets/product-v4/icons/document.png"),
  cart: require("../../../assets/product-v4/icons/cart.png"),
  doctor: require("../../../assets/product-v4/icons/doctor.png"),
  phone: require("../../../assets/product-v4/icons/phone.png"),
  cake: require("../../../assets/product-v4/icons/cake.png"),
  airplane: require("../../../assets/product-v4/icons/airplane.png"),
  shirt: require("../../../assets/product-v4/icons/shirt.png"),
  sun: require("../../../assets/product-v4/icons/sun.png"),
  calendar: require("../../../assets/product-v4/icons/calendar.png"),
  gift: require("../../../assets/product-v4/icons/gift.png"),
  plus: require("../../../assets/product-v4/icons/plus.png"),
  checkbox: require("../../../assets/product-v4/icons/checkbox.png"),
};

export function ForgotV4Icon({
  name,
  size,
  color,
  style,
}: {
  name: ForgottenIcon | "plus" | "checkbox";
  size: number;
  color?: string;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={ICONS[name]}
      style={[{ width: size, height: size, tintColor: color }, style]}
      resizeMode="contain"
    />
  );
}
